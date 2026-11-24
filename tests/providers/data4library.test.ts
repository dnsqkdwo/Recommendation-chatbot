import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SourceError } from '../../src/core/errors.js';
import { parseBookDetail, parseHotTrend } from '../../src/providers/data4library.js';

const fixture = (name: string): unknown => JSON.parse(readFileSync(`fixtures/data4library/${name}.json`, 'utf8'));

const codeOf = (fn: () => unknown): string | undefined => {
    try {
        fn();
    } catch (e) {
        return e instanceof SourceError ? e.code : undefined;
    }
    return undefined;
};

describe('parseHotTrend', () => {
    it('3일 × 5권 fixture → ISBN 중복을 뺀 9권, 최근 날짜 순위 유지', () => {
        const items = parseHotTrend(fixture('hottrend'));
        expect(items).toHaveLength(9);
        expect(items[0]).toEqual({
            id: 'data4library:9791124137635',
            sourceId: '9791124137635',
            source: 'data4library',
            category: 'book',
            title: '한국사 이상현상 연구원 :최인서 소설',
            author: '지은이: 최인서',
            publisher: '빅피시',
            imageUrl: expect.stringMatching(/^https:\/\//),
            link: expect.stringMatching(/^https:\/\/data4library\.kr\/bookV\?seq=\d+$/),
            metrics: { rank: 1 },
        });
        expect(items.map((i) => i.metrics.rank)).toEqual([1, 2, 3, 4, 5, 2, 3, 4, 5]);
    });

    it('인증 오류(authErr)는 AUTH_ERROR', () => {
        expect(codeOf(() => parseHotTrend(fixture('error')))).toBe('AUTH_ERROR');
    });

    it('그 밖의 errCode는 API_ERROR', () => {
        expect(codeOf(() => parseHotTrend({ response: { errCode: 'paramErr', error: 'X' } }))).toBe('API_ERROR');
    });

    it('도서가 없으면 EMPTY_RESPONSE', () => {
        expect(codeOf(() => parseHotTrend({ response: { results: [{ result: { docs: [] } }] } }))).toBe('EMPTY_RESPONSE');
    });
});

describe('parseBookDetail', () => {
    it('책 소개(description) 반환', () => {
        expect(parseBookDetail(fixture('detail'))).toMatch(/^소설가 김애란이/);
    });

    it('소개가 비면 null', () => {
        expect(parseBookDetail({ response: { detail: [{ book: { description: ' ' } }] } })).toBeNull();
    });
});
