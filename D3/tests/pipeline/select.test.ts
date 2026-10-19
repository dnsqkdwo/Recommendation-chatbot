import { describe, expect, it } from 'vitest';
import type { ContentItem } from '../../src/core/types.js';
import { isOngoing, selectPicks } from '../../src/pipeline/select.js';

const TODAY = '2026-10-19';

const movie = (rank: number): ContentItem => ({
    id: `kobis:${rank}`,
    sourceId: String(rank),
    source: 'kobis',
    category: 'movie',
    title: `영화${rank}`,
    metrics: { rank },
});

const show = (rank: number, endDate: string): ContentItem => ({
    id: `kopis:${rank}`,
    sourceId: String(rank),
    source: 'kopis',
    category: 'performance',
    title: `공연${rank}`,
    endDate,
    metrics: { rank },
});

describe('selectPicks (임시: 1위)', () => {
    it('분야별 순위가 가장 높은 항목을 고른다', () => {
        const picks = selectPicks([movie(3), movie(1), movie(2)], TODAY);
        expect(picks.get('movie')?.title).toBe('영화1');
        expect(picks.has('book')).toBe(false);
    });

    it('종료일이 지난 항목은 건너뛰고 다음 순위를 고른다', () => {
        const picks = selectPicks([show(1, '2026-10-18'), show(2, '2026-10-30')], TODAY);
        expect(picks.get('performance')?.title).toBe('공연2');
    });

    it('후보가 모두 종료됐으면 그 분야는 결과에서 빠진다', () => {
        expect(selectPicks([show(1, '2026-10-18')], TODAY).has('performance')).toBe(false);
    });
});

describe('isOngoing', () => {
    it('오늘 끝나는 항목은 남긴다', () => {
        expect(isOngoing(show(1, TODAY), TODAY)).toBe(true);
    });

    it('어제 끝난 항목은 뺀다', () => {
        expect(isOngoing(show(1, '2026-10-18'), TODAY)).toBe(false);
    });

    it('종료일이 없는 항목(영화·도서 등)은 남긴다', () => {
        expect(isOngoing(movie(1), TODAY)).toBe(true);
    });
});
