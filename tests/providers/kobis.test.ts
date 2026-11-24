import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SourceError } from '../../src/core/errors.js';
import { parseKobisList } from '../../src/providers/kobis.js';

const fixture = (name: string): unknown => JSON.parse(readFileSync(`fixtures/kobis/${name}.json`, 'utf8'));

describe('parseKobisList', () => {
    it('박스오피스 fixture → ContentItem', () => {
        const items = parseKobisList(fixture('list'));
        expect(items).toHaveLength(10);
        expect(items[0]).toEqual({
            id: 'kobis:20261807',
            sourceId: '20261807',
            source: 'kobis',
            category: 'movie',
            title: '극장판 치이카와: 인어 섬의 비밀',
            startDate: '2026-09-30',
            metrics: { rank: 1, audience: 1281485, isNew: false },
        });
    });

    it('잘못된 키(320010)는 AUTH_ERROR', () => {
        expect(() => parseKobisList(fixture('error'))).toThrow(SourceError);
        try {
            parseKobisList(fixture('error'));
        } catch (e) {
            expect((e as SourceError).code).toBe('AUTH_ERROR');
        }
    });

    it('목록이 비면 EMPTY_RESPONSE', () => {
        expect(() => parseKobisList({ boxOfficeResult: { dailyBoxOfficeList: [] } })).toThrow('0건');
    });
});
