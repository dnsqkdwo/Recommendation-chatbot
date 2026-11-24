// 분야별 요약. 분야끼리 병렬, 분야 안에서는 모델을 차례로 시도, 마감을 넘기면 그 분야 제외

import { createAppError, SourceError, type AppError } from '../core/errors.js';
import type { Category, LlmModel, RunContext } from '../core/types.js';
import { chatCompletion, type ChatMessage, type ChatResult } from './openrouter.js';
import { buildSummaryMessages } from './prompt.js';
import { parseSummary } from './validate.js';

export interface SummaryTarget {
    category: Category;
    description: string;
}

export type ChatCall = (model: LlmModel, messages: ChatMessage[], ctx: RunContext, timeoutMs: number) => Promise<ChatResult>;

export interface SummarizeOptions {
    models: readonly LlmModel[];
    timeoutMs: number; // 호출 1회
    deadline: Date;
    call?: ChatCall; // 테스트용
}

export interface SummarizeResult {
    summaries: Partial<Record<Category, string>>;
    errors: AppError[];
}

const DEADLINE = Symbol('deadline');

/** work와 마감 중 먼저 끝나는 쪽 반환. 이미 마감이 지났으면 바로 DEADLINE */
async function raceDeadline<T>(work: Promise<T>, deadline: Date, ctx: RunContext): Promise<T | typeof DEADLINE> {
    let timer: NodeJS.Timeout | undefined;
    const expired = new Promise<typeof DEADLINE>((resolve) => {
        timer = setTimeout(() => resolve(DEADLINE), Math.max(0, deadline.getTime() - ctx.now().getTime()));
    });
    try {
        return await Promise.race([work, expired]);
    } finally {
        clearTimeout(timer);
    }
}

// 모델을 차례로 시도해 첫 검증 통과 요약 반환. 실패한 시도는 모두 errors에 남김
async function summarizeOne(
    target: SummaryTarget,
    opts: SummarizeOptions,
    ctx: RunContext,
    errors: AppError[],
): Promise<string | null> {
    const call = opts.call ?? chatCompletion;
    const messages = buildSummaryMessages(target.description);
    for (const model of opts.models) {
        try {
            const res = await call(model, messages, ctx, opts.timeoutMs);
            const check = parseSummary(res.content, target.description);
            if (check.ok) return check.summary;
            errors.push(createAppError('llm', 'LLM_INVALID_OUTPUT', ctx.now(), `${target.category} ${model.id}: ${check.reason}`));
        } catch (e) {
            // 키 문제는 관리자 힌트가 붙도록 AUTH_ERROR 유지
            const code = e instanceof SourceError && e.code === 'AUTH_ERROR' ? 'AUTH_ERROR' : 'LLM_ERROR';
            const cause = e instanceof SourceError ? `${e.code} ${e.message}` : e instanceof Error ? e.message : String(e);
            errors.push(createAppError('llm', code, ctx.now(), `${target.category} ${model.id}: ${cause}`.slice(0, 200)));
        }
    }
    return null;
}

/**
 * 분야별 요약을 병렬로 만듦. 모든 시도가 실패하거나 마감까지 끝나지 않은 분야는 summaries에 없음.
 * 마감 초과는 DEADLINE_EXCEEDED로 기록. 마감 뒤에 시작하면 마감을 적용하지 않음
 */
export async function summarizeAll(
    targets: readonly SummaryTarget[],
    opts: SummarizeOptions,
    ctx: RunContext,
): Promise<SummarizeResult> {
    const errors: AppError[] = [];
    const summaries: Partial<Record<Category, string>> = {};
    // 마감 뒤에 기동한 경우는 마감 없이 요약. 호출당 타임아웃만 적용
    const lateStart = ctx.now().getTime() >= opts.deadline.getTime();
    await Promise.all(
        targets.map(async (target) => {
            const work = summarizeOne(target, opts, ctx, errors);
            const result = lateStart ? await work : await raceDeadline(work, opts.deadline, ctx);
            if (result === DEADLINE) {
                errors.push(createAppError('llm', 'DEADLINE_EXCEEDED', ctx.now(), target.category));
            } else if (result !== null) {
                summaries[target.category] = result;
            }
        }),
    );
    return { summaries, errors };
}
