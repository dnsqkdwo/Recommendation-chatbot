import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SourceError } from '../../src/core/errors.js';
import { parseCultureInfo, parseCultureInfoDetail } from '../../src/providers/cultureInfo.js';

const fixture = (name: string): string => readFileSync(`fixtures/cultureInfo/${name}.xml`, 'utf8');

const codeOf = (fn: () => unknown): string | undefined => {
    try {
        fn();
    } catch (e) {
        return e instanceof SourceError ? e.code : undefined;
    }
    return undefined;
};

const wrap = (items: string): string =>
    `<response><header><resultCode>00</resultCode></header><body><items>${items}</items></body></response>`;

describe('parseCultureInfo', () => {
    it('316건 fixture에서 행사/축제·전시 75건만 ContentItem으로', () => {
        const items = parseCultureInfo(fixture('list'));
        expect(items).toHaveLength(75);
        expect(items[0]).toEqual({
            id: 'cultureInfo:400093',
            sourceId: '400093',
            source: 'cultureInfo',
            category: 'event',
            title: '시간을 잇는 철도',
            startDate: '2026-04-28',
            endDate: '2026-10-31',
            venue: '국토발전전시관',
            region: '서울',
            imageUrl: 'http://www.culture.go.kr/upload/ucms/oneCltInfo/2026/202609/b4af12f0e63248d18fb3987e60e7f232.jpg',
            genre: '전시',
            metrics: {},
        });
    });

    it('두 번 인코딩된 제목을 풂', () => {
        const titles = parseCultureInfo(fixture('list')).map((i) => i.title);
        expect(titles).toContain('2026 새빛문화예술클럽 <시민의 메아리>');
        expect(titles.some((t) => /&[a-z#]/i.test(t))).toBe(false);
    });

    it('1건이어도 배열로 처리, 공연·교육/체험은 제외', () => {
        const row = (service: string, seq: string) =>
            `<item><serviceName>${service}</serviceName><seq>${seq}</seq><title>T</title><startDate>20261026</startDate>`
            + '<endDate>20261026</endDate><place></place><area></area><thumbnail></thumbnail></item>';
        expect(parseCultureInfo(wrap(row('행사/축제', '1')))).toHaveLength(1);
        expect(parseCultureInfo(wrap(row('공연', '1') + row('교육/체험', '2')))).toEqual([]);
    });

    it('미등록 키(returnReasonCode 30)는 AUTH_ERROR', () => {
        expect(codeOf(() => parseCultureInfo(fixture('error')))).toBe('AUTH_ERROR');
    });

    it('resultCode가 00이 아니면 API_ERROR', () => {
        const xml = '<response><header><resultCode>12</resultCode><resultMsg>NO_OPENAPI_SERVICE_ERROR</resultMsg></header></response>';
        expect(codeOf(() => parseCultureInfo(xml))).toBe('API_ERROR');
    });

    it('목록이 비면 EMPTY_RESPONSE', () => {
        expect(codeOf(() => parseCultureInfo(wrap('')))).toBe('EMPTY_RESPONSE');
    });
});

describe('parseCultureInfoDetail', () => {
    it('소개문(contents1)이 비면 description null, 관람료는 facts로, url은 link로', () => {
        expect(parseCultureInfoDetail(fixture('detail'))).toEqual({
            description: null,
            facts: [{ label: '관람료', value: '전석 2,000원' }],
            link: 'https://ticket.yes24.com/Perf/57294',
        });
    });

    it('소개문의 HTML 태그를 지우고 엔티티를 풀어 반환', () => {
        const xml = wrap('<item><contents1>&lt;p&gt;&amp;lt;소개&amp;gt; 본문&lt;/p&gt;</contents1><price></price><url></url></item>');
        expect(parseCultureInfoDetail(xml)).toEqual({ description: '<소개> 본문', facts: [] });
    });

    it('두 번 인코딩된 url의 &를 풀어 link로', () => {
        const xml = wrap('<item><url>https://a.kr/view?x=1&amp;amp;y=2</url></item>');
        expect(parseCultureInfoDetail(xml).link).toBe('https://a.kr/view?x=1&y=2');
    });
});
