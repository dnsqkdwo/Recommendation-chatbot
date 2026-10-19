import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SourceError } from '../../src/core/errors.js';
import { parseKopisBoxOffice, parseKopisDetail } from '../../src/providers/kopis.js';

const fixture = (name: string): string => readFileSync(`fixtures/kopis/${name}.xml`, 'utf8');

const codeOf = (fn: () => unknown): string | undefined => {
    try {
        fn();
    } catch (e) {
        return e instanceof SourceError ? e.code : undefined;
    }
    return undefined;
};

describe('parseKopisBoxOffice', () => {
    it('예매상황판 fixture → ContentItem', () => {
        const items = parseKopisBoxOffice(fixture('boxoffice'));
        expect(items).toHaveLength(50);
        expect(items[0]).toEqual({
            id: 'kopis:PF300910',
            sourceId: 'PF300910',
            source: 'kopis',
            category: 'performance',
            title: 'AKMU CONCERT: 소문의 낙원 (Paradise of Rumors) [대전]',
            startDate: '2026-12-05',
            endDate: '2026-12-06',
            venue: '대전컨벤션센터 (DCC) 제2전시장',
            region: '대전',
            imageUrl: 'http://www.kopis.or.kr/upload/pfmPoster/PF_PF300910_260914_171757.jpg',
            metrics: { rank: 1 },
        });
        expect(items.map((i) => i.metrics.rank)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    });

    it('1건이어도 배열로 처리', () => {
        const one = '<boxofs><boxof><rnum>1</rnum><prfnm>A</prfnm><prfpd>2026.10.01~2026.10.02</prfpd>'
            + '<area>서울</area><prfplcnm>극장</prfplcnm><poster></poster><mt20id>PF1</mt20id></boxof></boxofs>';
        expect(parseKopisBoxOffice(one)).toHaveLength(1);
    });

    it('미등록 키(returncode 02)는 AUTH_ERROR', () => {
        expect(codeOf(() => parseKopisBoxOffice(fixture('error')))).toBe('AUTH_ERROR');
    });

    it('그 밖의 returncode는 API_ERROR', () => {
        const xml = '<dbs><db><returncode>99</returncode><errmsg>X</errmsg></db></dbs>';
        expect(codeOf(() => parseKopisBoxOffice(xml))).toBe('API_ERROR');
    });

    it('목록이 비면 EMPTY_RESPONSE', () => {
        expect(codeOf(() => parseKopisBoxOffice('<boxofs></boxofs>'))).toBe('EMPTY_RESPONSE');
    });
});

describe('parseKopisDetail', () => {
    it('소개문(sty)의 HTML 엔티티를 풀어 반환', () => {
        const sty = parseKopisDetail(fixture('detail'));
        expect(sty).toMatch(/^\[Program\]/);
        expect(sty).toContain('<I hope this letter finds you well>');
    });

    it('소개문이 비면 null', () => {
        expect(parseKopisDetail('<dbs><db><mt20id>PF1</mt20id><sty> </sty></db></dbs>')).toBeNull();
    });
});
