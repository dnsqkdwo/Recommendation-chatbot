import type { Category, ContentItem } from '../core/types.js';

// 메시지로 보낼 분야 순서 ( 영화 -> 공연 -> 행사 -> 책 )
export const CATEGORY_ORDER: readonly Category[] = ['movie', 'performance', 'event', 'book'];

/** 종료일이 today(YYYY-MM-DD, KST)보다 이전이면 false. 종료일이 없으면 남김 */
export const isOngoing = (item: ContentItem, today: string): boolean =>
    item.endDate === undefined || item.endDate >= today;

// 분야별로 1건씩 선택
// 종료된 항목은 모든 소스 공통으로 여기서 제외하고, 후보가 없는 분야는 결과에서 뺌
export function selectPicks(items: readonly ContentItem[], today: string): Map<Category, ContentItem> {
    const picks = new Map<Category, ContentItem>();
    const ongoing = items.filter((item) => isOngoing(item, today));
    for (const category of CATEGORY_ORDER) {
        const candidates = ongoing.filter((item) => item.category === category);
        const top = candidates.reduce<ContentItem | undefined>(
            (best, item) =>
                best === undefined || (item.metrics.rank ?? Infinity) < (best.metrics.rank ?? Infinity) ? item : best,
            undefined,
        );
        if (top) picks.set(category, top);
    }
    return picks;
}
