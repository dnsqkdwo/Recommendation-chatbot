import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SourceError } from '../../src/core/errors.js';
import { parseNlRecommend } from '../../src/providers/nlRecommend.js';

const fixture = (name: string): string => readFileSync(`fixtures/nlRecommend/${name}.xml`, 'utf8');

const codeOf = (fn: () => unknown): string | undefined => {
    try {
        fn();
    } catch (e) {
        return e instanceof SourceError ? e.code : undefined;
    }
    return undefined;
};

describe('parseNlRecommend', () => {
    it('최근 1년 fixture → ContentItem (최신 추천순)', () => {
        const items = parseNlRecommend(fixture('list'));
        expect(items).toHaveLength(52);
        expect(items[0]).toEqual({
            id: 'nlRecommend:20260922163135829100',
            sourceId: '20260922163135829100',
            source: 'nlRecommend',
            category: 'book',
            title: '삼문동 봉주르 아파트 : 오서 장편소설',
            author: '지은이: 오서',
            publisher: '자음과모음',
            description: expect.stringMatching(/^우리나라 가구의 절반 이상이 아파트에 산다지만/),
            metrics: { recommended: true },
        });
    });

    it('1건이어도 배열로 처리', () => {
        const xml = '<channel><totalCount>1</totalCount><list><item><recomNo>1</recomNo><recomtitle>A</recomtitle></item></list></channel>';
        expect(parseNlRecommend(xml)).toHaveLength(1);
    });

    it('유효하지 않은 키(011)는 AUTH_ERROR', () => {
        expect(codeOf(() => parseNlRecommend(fixture('error')))).toBe('AUTH_ERROR');
    });

    it('그 밖의 error_code는 API_ERROR', () => {
        expect(codeOf(() => parseNlRecommend('<error><msg>X</msg><error_code>099</error_code></error>'))).toBe('API_ERROR');
    });

    it('목록이 비면 EMPTY_RESPONSE', () => {
        expect(codeOf(() => parseNlRecommend('<channel><totalCount>0</totalCount></channel>'))).toBe('EMPTY_RESPONSE');
    });
});
