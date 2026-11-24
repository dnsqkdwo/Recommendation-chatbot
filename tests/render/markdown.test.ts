import { describe, expect, it } from 'vitest';
import type { ContentItem } from '../../src/core/types.js';
import { renderMessage } from '../../src/render/markdown.js';

const SEND = new Date('2026-10-13T17:00:00+09:00');
const body = (text: string) => text.split('\n').slice(2);

describe('renderMessage', () => {
    it('분야 사이는 구분선, 앞뒤에 빈 줄', () => {
        const movie: ContentItem = { id: 'kobis:1', sourceId: '1', source: 'kobis', category: 'movie', title: '영화', metrics: {} };
        const book: ContentItem = { id: 'nlRecommend:1', sourceId: '1', source: 'nlRecommend', category: 'book', title: '책', metrics: {} };
        expect(body(renderMessage(SEND, [{ item: movie, facts: [] }, { item: book, facts: [] }]))).toEqual([
            '**🎬 [영화] 영화**',
            '',
            '*출처: KOBIS 영화관입장권통합전산망*',
            '',
            '---',
            '',
            '**📚 [서적] 책**',
            '',
            '*출처: 국립중앙도서관 사서추천도서*',
        ]);
    });

    it('영화: 개봉·박스오피스 줄, 요약이 없으면 빈 줄 뒤 출처만', () => {
        const item: ContentItem = {
            id: 'kobis:1',
            sourceId: '1',
            source: 'kobis',
            category: 'movie',
            title: '테스트 영화',
            startDate: '2026-10-01',
            metrics: { rank: 1, audience: 123456 },
        };
        expect(renderMessage(SEND, [{ item, facts: [] }])).toBe(
            [
                '#### 오늘의 문화 추천 · 2026-10-13 (화)',
                '',
                '**🎬 [영화] 테스트 영화**',
                '- 개봉: 2026-10-01',
                '- 박스오피스 1위 · 누적 관객 123,456명',
                '',
                '*출처: KOBIS 영화관입장권통합전산망*',
            ].join('\n'),
        );
    });

    it('공연: 링크가 있어도 제목만, 기간·장소·순위, 상세 항목, 요약, 출처', () => {
        const item: ContentItem = {
            id: 'kopis:PF1',
            sourceId: 'PF1',
            source: 'kopis',
            category: 'performance',
            title: '테스트 공연',
            startDate: '2026-10-01',
            endDate: '2026-10-05',
            venue: '테스트 극장',
            region: '서울',
            link: 'https://example.com/ticket',
            metrics: { rank: 2 },
        };
        const facts = [
            { label: '출연', value: '홍길동' },
            { label: '공연시간', value: '1시간 30분' },
        ];
        expect(body(renderMessage(SEND, [{ item, facts, summary: '요약 첫 문장입니다. 둘째 문장입니다.' }]))).toEqual([
            '**🎭 [공연] 테스트 공연**',
            '- 기간: 2026-10-01 ~ 2026-10-05',
            '- 장소: 테스트 극장 (서울)',
            '- 예매상황판 2위',
            '- 출연: 홍길동 / 공연시간: 1시간 30분',
            '',
            '> 요약 첫 문장입니다. 둘째 문장입니다.',
            '',
            '*출처: KOPIS 공연예술통합전산망*',
        ]);
    });

    it('행사: 기간·장소만', () => {
        const item: ContentItem = {
            id: 'tourApi:1',
            sourceId: '1',
            source: 'tourApi',
            category: 'event',
            title: '테스트 축제',
            startDate: '2026-10-30',
            endDate: '2026-11-01',
            venue: '테스트시 테스트로 1',
            metrics: {},
        };
        expect(body(renderMessage(SEND, [{ item, facts: [] }]))).toEqual([
            '**🎨 [행사] 테스트 축제**',
            '- 기간: 2026-10-30 ~ 2026-11-01',
            '- 장소: 테스트시 테스트로 1',
            '',
            '*출처: 한국관광콘텐츠랩*',
        ]);
    });

    it('서적: 저자는 라벨 없이 API 값 그대로, 출판사', () => {
        const item: ContentItem = {
            id: 'nlRecommend:1',
            sourceId: '1',
            source: 'nlRecommend',
            category: 'book',
            title: '테스트 책',
            author: '홍길동 지음',
            publisher: '테스트출판',
            metrics: { recommended: true },
        };
        expect(body(renderMessage(SEND, [{ item, facts: [], summary: '요약입니다. 끝입니다.' }]))).toEqual([
            '**📚 [서적] 테스트 책**',
            '- 홍길동 지음 / 출판사: 테스트출판',
            '',
            '> 요약입니다. 끝입니다.',
            '',
            '*출처: 국립중앙도서관 사서추천도서*',
        ]);
    });
});
