import { describe, expect, it } from 'vitest';
import { asArray, parseXml } from '../../src/core/xml.js';

describe('asArray', () => {
    it('배열은 그대로 반환한다', () => {
        expect(asArray([1, 2])).toEqual([1, 2]);
    });

    it('객체 1건은 배열로 감싼다', () => {
        expect(asArray({ a: 1 })).toEqual([{ a: 1 }]);
    });

    it('없거나 빈 값은 빈 배열이다', () => {
        expect(asArray(undefined)).toEqual([]);
        expect(asArray(null)).toEqual([]);
        expect(asArray('')).toEqual([]);
    });
});

describe('parseXml', () => {
    it('1건이면 객체, 2건이면 배열로 파싱되고 값은 문자열로 남는다', () => {
        const one = parseXml('<dbs><db><id>007</id></db></dbs>') as { dbs: { db: unknown } };
        const two = parseXml('<dbs><db><id>1</id></db><db><id>2</id></db></dbs>') as { dbs: { db: unknown } };
        expect(asArray(one.dbs.db)).toEqual([{ id: '007' }]);
        expect(asArray(two.dbs.db)).toEqual([{ id: '1' }, { id: '2' }]);
    });
});
