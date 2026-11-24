// 선정 건의 설명문 확보. 설명문이 있는 후보를 차례로 찾고, 끝내 없으면 첫 후보를 요약 없이 보냄

import { toAppError, type AppError } from '../core/errors.js';
import type { Category, ContentItem, DetailInfo, Fact, Provider, RunContext } from '../core/types.js';
import { findMoviePlot } from '../providers/kmdb.js';
import type { CategorySelection } from './select.js';

export const MIN_DESCRIPTION_LENGTH = 50; // 이보다 짧으면 요약 원문으로 쓰지 않음

export interface DetailedPick {
    category: Category;
    item: ContentItem;
    description: string | null; // null이면 요약 없이 발송
    facts: Fact[];
    descriptionSource?: string; // 설명문 출처
}

const usable = (text: string | null | undefined): string | null => {
    const trimmed = text?.trim() ?? '';
    return trimmed.length >= MIN_DESCRIPTION_LENGTH ? trimmed : null;
};

// 목록 설명문 → KMDb(영화) → provider 상세 순으로 확인. 실패는 throw
async function lookup(
    item: ContentItem,
    provider: Provider | undefined,
    ctx: RunContext,
): Promise<DetailInfo & { source?: string }> {
    if (usable(item.description)) return { description: item.description!.trim(), facts: [], source: `${item.source} 목록` };
    if (item.source === 'kobis') {
        // 줄거리는 KOBIS에 없어 KMDb에서 제목 + 개봉연도로 찾음
        const plot = await findMoviePlot(item.title, item.startDate?.slice(0, 4) ?? '', ctx);
        return { description: plot, facts: [], source: 'kmdb' };
    }
    if (!provider?.fetchDetail) return { description: null, facts: [] };
    return { ...(await provider.fetchDetail(item, ctx)), source: `${item.source} 상세` };
}

async function detailFor(
    selection: CategorySelection,
    providers: readonly Provider[],
    ctx: RunContext,
    errors: AppError[],
): Promise<DetailedPick | null> {
    let first: DetailedPick | null = null;
    for (const item of selection.picks) {
        const provider = providers.find((p) => p.name === item.source);
        let info: DetailInfo & { source?: string };
        try {
            info = await lookup(item, provider, ctx);
        } catch (e) {
            const error = toAppError(item.source === 'kobis' ? 'kmdb' : item.source, e, ctx.now());
            errors.push({ ...error, code: 'DETAIL_FAILED', detail: `${error.code}${error.detail ? ` ${error.detail}` : ''}` });
            info = { description: null, facts: [] };
        }
        const pick: DetailedPick = {
            category: selection.category,
            // 목록에 링크가 없는 소스는 상세의 링크를 씀
            item: info.link && !item.link ? { ...item, link: info.link } : item,
            description: usable(info.description),
            facts: info.facts,
            ...(info.source ? { descriptionSource: info.source } : {}),
        };
        if (pick.description) return pick;
        first ??= pick;
    }
    return first;
}

/**
 * 분야별 picks를 차례로 보며 설명문(50자 이상)이 있는 첫 후보를 고름. 셋 다 없으면 첫 후보를 description null로 반환.
 * 상세 조회 실패는 DETAIL_FAILED로 errors에 담고 다음 후보로 넘어감. 분야끼리는 병렬
 */
export async function fetchDetails(
    selections: readonly CategorySelection[],
    providers: readonly Provider[],
    ctx: RunContext,
): Promise<{ picks: DetailedPick[]; errors: AppError[] }> {
    const errors: AppError[] = [];
    const results = await Promise.all(selections.map((s) => detailFor(s, providers, ctx, errors)));
    return { picks: results.filter((p): p is DetailedPick => p !== null), errors };
}
