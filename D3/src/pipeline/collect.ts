// 등록된 provider 목록 수집. 한 소스가 실패해도 나머지는 계속 진행

import { type AppError, toAppError } from '../core/errors.js';
import type { ContentItem, Provider, RunContext, SourceName } from '../core/types.js';

export interface CollectResult {
    items: ContentItem[];
    counts: { source: SourceName; count: number }[]; // 성공한 소스별 건수
    errors: AppError[];
}

/** 모든 provider를 병렬 호출. 실패한 소스는 errors에 담고 예외를 던지지 않음 */
export async function collect(providers: readonly Provider[], ctx: RunContext): Promise<CollectResult> {
    const results = await Promise.allSettled(providers.map((p) => p.fetchList(ctx)));
    const out: CollectResult = { items: [], counts: [], errors: [] };
    results.forEach((result, i) => {
        const provider = providers[i]!;
        if (result.status === 'fulfilled') {
            out.counts.push({ source: provider.name, count: result.value.length });
            out.items.push(...result.value);
        } else {
            out.errors.push(toAppError(provider.name, result.reason, ctx.now()));
        }
    });
    return out;
}
