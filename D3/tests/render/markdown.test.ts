import { describe, expect, it } from 'vitest';
import { renderMessage } from '../../src/render/markdown.js';

describe('renderMessage', () => {
    it('Day 2 확정 형식', () => {
        const text = renderMessage(new Date('2026-10-13T17:00:00+09:00'), [
            {
                id: 'kobis:1',
                sourceId: '1',
                source: 'kobis',
                category: 'movie',
                title: '테스트 영화',
                startDate: '2026-10-01',
                metrics: { rank: 1, audience: 123456 },
            },
        ]);
        expect(text).toBe(
            [
                '#### 오늘의 문화 추천 · 2026-10-13 (화)',
                '',
                '**[영화] 테스트 영화**',
                '- 개봉: 2026-10-01',
                '- 박스오피스 1위 · 누적 관객 123,456명',
                '- 출처: KOBIS 영화관입장권통합전산망',
            ].join('\n'),
        );
    });

    it('공연은 기간·장소·예매상황판 순위 표시', () => {
        const text = renderMessage(new Date('2026-10-13T17:00:00+09:00'), [
            {
                id: 'kopis:PF1',
                sourceId: 'PF1',
                source: 'kopis',
                category: 'performance',
                title: '테스트 공연',
                startDate: '2026-10-01',
                endDate: '2026-10-05',
                venue: '테스트 극장',
                region: '서울',
                metrics: { rank: 2 },
            },
        ]);
        expect(text.split('\n').slice(2)).toEqual([
            '**[공연] 테스트 공연**',
            '- 기간: 2026-10-01 ~ 2026-10-05',
            '- 장소: 테스트 극장 (서울)',
            '- 예매상황판 2위',
            '- 출처: KOPIS 공연예술통합전산망',
        ]);
    });
});
