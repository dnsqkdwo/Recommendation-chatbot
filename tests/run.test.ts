import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CliOptions } from '../src/cli.js';
import { ENV_KEYS, loadEnv } from '../src/config.js';
import { run } from '../src/run.js';
import type { ChatCall } from '../src/summarize/summarize.js';

// fixture 저장일(2026-10-26 월) 기준으로 전체 흐름 실행. 발송은 dry-run이라 콘솔로만 나감
const env = loadEnv(Object.fromEntries(ENV_KEYS.map((k) => [k, `dummy-${k}`])));
const SUMMARY = '요약 첫 문장입니다. 요약 둘째 문장입니다.';

const opts = (now: string): CliOptions => ({
    dryRun: true,
    now,
    noWait: false,
    skipHoliday: false,
    useFixtures: true,
    debugSelect: false,
});

const chatAfter =
    (ms: number): ChatCall =>
    async () => {
        await new Promise((r) => setTimeout(r, ms));
        return { content: JSON.stringify({ summary: SUMMARY }), reasoningTokens: 0 };
    };

function captureLog(): () => string {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        lines.push(args.join(' '));
    });
    return () => lines.join('\n');
}

const section = (output: string, title: string) => output.split(`--- ${title} (dry-run) ---`)[1]?.split('\n--- ')[0] ?? '';

afterEach(() => vi.restoreAllMocks());

describe('run (--use-fixtures --dry-run)', () => {
    it('16:30 기동: 4개 분야 렌더, 설명문 있는 분야는 요약 포함, 17:00까지 약 30분 대기', async () => {
        const output = captureLog();
        const sleeps: number[] = [];
        const code = await run(opts('2026-10-26T16:30:00+09:00'), env, {
            sleep: async (ms) => void sleeps.push(ms),
            chat: chatAfter(0),
        });

        expect(code).toBe(0);
        expect(sleeps).toHaveLength(1);
        expect(sleeps[0]).toBeGreaterThan(29 * 60_000);
        expect(sleeps[0]).toBeLessThanOrEqual(30 * 60_000);

        const message = section(output(), '사용자 메시지');
        for (const label of ['[영화]', '[공연]', '[행사]', '[서적]']) expect(message).toContain(label);
        expect(message.split(SUMMARY)).toHaveLength(4); // 공연·행사·서적 3건
        expect(output()).not.toContain('--- 관리자 메시지');
    });

    it('16:55 직전 기동, 요약이 마감을 넘기면 그 분야 제외하고 DEADLINE_EXCEEDED 통지', async () => {
        const output = captureLog();
        const code = await run(opts('2026-10-26T16:54:59.700+09:00'), env, {
            sleep: async () => {},
            chat: chatAfter(2_000),
        });

        expect(code).toBe(0);
        const message = section(output(), '사용자 메시지');
        expect(message).toContain('[영화]'); // 설명문이 없어 요약 없이 나가는 분야
        expect(message).not.toContain('[공연]');
        expect(message).not.toContain(SUMMARY);
        const admin = section(output(), '관리자 메시지');
        expect(admin).toContain('발송 1개 분야');
        expect(admin.match(/DEADLINE_EXCEEDED/g)).toHaveLength(3);
    });

    it('17:01 기동(수동 재실행): 대기 없이, 마감 없이 요약해 바로 발송', async () => {
        const output = captureLog();
        const sleeps: number[] = [];
        const calls: number[] = [];
        const code = await run(opts('2026-10-26T17:01:00+09:00'), env, {
            sleep: async (ms) => void sleeps.push(ms),
            chat: async (...args) => {
                calls.push(1);
                return chatAfter(0)(...args);
            },
        });

        expect(code).toBe(0);
        expect(sleeps).toEqual([]);
        expect(calls).toHaveLength(3);
        const message = section(output(), '사용자 메시지');
        for (const label of ['[영화]', '[공연]', '[행사]', '[서적]']) expect(message).toContain(label);
        expect(message.split(SUMMARY)).toHaveLength(4);
        expect(output()).not.toContain('DEADLINE_EXCEEDED');
    });
});
