import { describe, expect, it } from 'vitest';
import { SourceError } from '../../src/core/errors.js';
import type { LlmModel, RunContext } from '../../src/core/types.js';
import { summarizeAll, type ChatCall } from '../../src/summarize/summarize.js';

const PRIMARY: LlmModel = { id: 'primary', jsonMode: true, reasoningOff: true };
const FALLBACK: LlmModel = { id: 'fallback', jsonMode: false, reasoningOff: false };
const GOOD = JSON.stringify({ summary: '첫 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다.' });

const ctx = { now: () => new Date(), useFixtures: false, httpTimeoutMs: 10_000, env: {} } as unknown as RunContext;
const later = (ms: number) => new Date(Date.now() + ms);
const reply = (content: string | null) => ({ content, reasoningTokens: 0 });

// 모델 ID별 동작을 정한 가짜 호출. 호출 순서를 calls에 남김
function fakeCall(byModel: Record<string, () => Promise<string | null>>, calls: string[] = []): ChatCall {
    return async (model) => {
        calls.push(model.id);
        return reply(await byModel[model.id]!());
    };
}

const target = { category: 'movie' as const, description: '원문' };

describe('summarizeAll', () => {
    it('주 모델이 성공하면 대체 모델을 부르지 않음', async () => {
        const calls: string[] = [];
        const call = fakeCall({ primary: async () => GOOD }, calls);
        const result = await summarizeAll([target], { models: [PRIMARY, FALLBACK], timeoutMs: 1000, deadline: later(1000), call }, ctx);
        expect(result.summaries.movie).toBe('첫 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다.');
        expect(result.errors).toEqual([]);
        expect(calls).toEqual(['primary']);
    });

    it('주 모델 실패 시 대체 모델로 1회 재시도, 실패는 기록', async () => {
        const call = fakeCall({
            primary: async () => {
                throw new SourceError('HTTP_ERROR', 'HTTP 429 rate-limited');
            },
            fallback: async () => GOOD,
        });
        const result = await summarizeAll([target], { models: [PRIMARY, FALLBACK], timeoutMs: 1000, deadline: later(1000), call }, ctx);
        expect(result.summaries.movie).toBeDefined();
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatchObject({ source: 'llm', code: 'LLM_ERROR' });
        expect(result.errors[0]!.detail).toContain('movie primary: HTTP_ERROR HTTP 429');
    });

    it('두 모델 모두 실패하면 분야 제외, 검증 실패는 LLM_INVALID_OUTPUT', async () => {
        const call = fakeCall({ primary: async () => '{"summary": "한 문장입니다."}', fallback: async () => null });
        const result = await summarizeAll([target], { models: [PRIMARY, FALLBACK], timeoutMs: 1000, deadline: later(1000), call }, ctx);
        expect(result.summaries.movie).toBeUndefined();
        expect(result.errors.map((e) => e.code)).toEqual(['LLM_INVALID_OUTPUT', 'LLM_INVALID_OUTPUT']);
    });

    it('인증 오류는 AUTH_ERROR로 남김', async () => {
        const call = fakeCall({
            primary: async () => {
                throw new SourceError('AUTH_ERROR', 'HTTP 401');
            },
        });
        const result = await summarizeAll([target], { models: [PRIMARY], timeoutMs: 1000, deadline: later(1000), call }, ctx);
        expect(result.errors[0]?.code).toBe('AUTH_ERROR');
    });

    it('마감 뒤에 시작하면 마감 없이 요약 (수동 재실행)', async () => {
        const call: ChatCall = async () => reply(await new Promise<string>((r) => setTimeout(() => r(GOOD), 100)));
        const result = await summarizeAll([target], { models: [PRIMARY], timeoutMs: 1000, deadline: later(-1), call }, ctx);
        expect(result.summaries.movie).toBeDefined();
        expect(result.errors).toEqual([]);
    });

    it('[주, 주, 대체] 순서로 시도: 주 모델 깨진 출력 후 주 모델 재시도 성공', async () => {
        const calls: string[] = [];
        let n = 0;
        const call: ChatCall = async (model) => {
            calls.push(model.id);
            return reply(n++ === 0 ? JSON.stringify({ summary: '쓸atitude한 삶입니다. 끝입니다.' }) : GOOD);
        };
        const result = await summarizeAll(
            [{ category: 'book', description: '원문입니다.' }],
            { models: [PRIMARY, PRIMARY, FALLBACK], timeoutMs: 1000, deadline: later(1000), call },
            ctx,
        );
        expect(calls).toEqual(['primary', 'primary']);
        expect(result.summaries.book).toBeDefined();
        expect(result.errors).toEqual([expect.objectContaining({ code: 'LLM_INVALID_OUTPUT' })]);
        expect(result.errors[0]!.detail).toContain('원문에 없는 문자열: atitude');
    });

    it('마감까지 안 끝난 분야만 DEADLINE_EXCEEDED로 제외', async () => {
        const call: ChatCall = async (_model, messages) =>
            reply(
                messages[1]!.content.includes('느림')
                    ? await new Promise<string>((r) => setTimeout(() => r(GOOD), 300))
                    : GOOD,
            );
        const result = await summarizeAll(
            [target, { category: 'book', description: '느림' }],
            { models: [PRIMARY], timeoutMs: 1000, deadline: later(50), call },
            ctx,
        );
        expect(result.summaries.movie).toBeDefined();
        expect(result.summaries.book).toBeUndefined();
        expect(result.errors).toEqual([expect.objectContaining({ code: 'DEADLINE_EXCEEDED', detail: 'book' })]);
    });
});
