import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SourceError } from '../../src/core/errors.js';
import { parseTourDetail, parseTourFestivals, parseTourHomepage } from '../../src/providers/tourApi.js';

const fixture = (name: string): string => readFileSync(`fixtures/tourApi/${name}.json`, 'utf8');

const codeOf = (fn: () => unknown): string | undefined => {
    try {
        fn();
    } catch (e) {
        return e instanceof SourceError ? e.code : undefined;
    }
    return undefined;
};

describe('parseTourFestivals', () => {
    it('축제 fixture → ContentItem', () => {
        const items = parseTourFestivals(fixture('list'));
        expect(items).toHaveLength(135);
        expect(items[0]).toEqual({
            id: 'tourApi:3113995',
            sourceId: '3113995',
            source: 'tourApi',
            category: 'event',
            title: '경기‧양주‧지작사 드론봇 페스티벌',
            startDate: '2026-10-30',
            endDate: '2026-11-01',
            venue: '경기도 양주시 광적면 삼일로 52',
            imageUrl: 'https://tong.visitkorea.or.kr/cms/resource/54/4124654_image2_1.JPG',
            metrics: {},
        });
    });

    it('미등록 키(returnReasonCode 30)는 AUTH_ERROR', () => {
        expect(codeOf(() => parseTourFestivals(fixture('error')))).toBe('AUTH_ERROR');
    });

    it('XML로 온 게이트웨이 오류도 같은 코드로 처리', () => {
        const xml = '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>'
            + '<returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>';
        expect(codeOf(() => parseTourFestivals(xml))).toBe('AUTH_ERROR');
    });

    it('resultCode가 0000이 아니면 API_ERROR', () => {
        const json = JSON.stringify({ response: { header: { resultCode: '10', resultMsg: 'INVALID_REQUEST_PARAMETER_ERROR' } } });
        expect(codeOf(() => parseTourFestivals(json))).toBe('API_ERROR');
    });

    it('items가 빈 문자열이면 EMPTY_RESPONSE', () => {
        const json = JSON.stringify({ response: { header: { resultCode: '0000' }, body: { items: '' } } });
        expect(codeOf(() => parseTourFestivals(json))).toBe('EMPTY_RESPONSE');
    });
});

describe('parseTourDetail', () => {
    it('소개문(overview) 반환', () => {
        expect(parseTourDetail(fixture('detail'))).toMatch(/^경기‧양주‧지작사 드론봇 페스티벌은/);
    });

    it('소개문이 없으면 null', () => {
        const json = JSON.stringify({ response: { header: { resultCode: '0000' }, body: { items: { item: [{ overview: ' ' }] } } } });
        expect(parseTourDetail(json)).toBeNull();
    });
});

describe('parseTourHomepage', () => {
    it('homepage의 주소 반환, <a href> 형태면 주소만 뽑음', () => {
        expect(parseTourHomepage(fixture('detail'))).toBe('https://www.yangju.go.kr/');
        const json = (homepage: string) =>
            JSON.stringify({ response: { header: { resultCode: '0000' }, body: { items: { item: [{ homepage }] } } } });
        expect(parseTourHomepage(json('<a href="http://example.com/fest" target="_blank">바로가기</a>'))).toBe('http://example.com/fest');
        expect(parseTourHomepage(json(''))).toBeNull();
    });
});

describe('throwIfDataGoKrError', () => {
    it('기한 만료(31)도 AUTH_ERROR', () => {
        const json = JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: '31', errMsg: 'X' } } });
        expect(codeOf(() => parseTourFestivals(json))).toBe('AUTH_ERROR');
    });
});
