import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SourceError } from '../../src/core/errors.js';
import { parseSeoulCulture } from '../../src/providers/seoulCulture.js';

const fixture = (name: string): string => readFileSync(`fixtures/seoulCulture/${name}`, 'utf8');

const codeOf = (fn: () => unknown): string | undefined => {
    try {
        fn();
    } catch (e) {
        return e instanceof SourceError ? e.code : undefined;
    }
    return undefined;
};

describe('parseSeoulCulture', () => {
    it('1000행 fixture에서 공연 7종만 ContentItem으로', () => {
        const items = parseSeoulCulture(fixture('list.json'));
        expect(items).toHaveLength(350);
        expect(new Set(items.map((i) => i.category))).toEqual(new Set(['performance']));
        expect(items[0]).toEqual({
            id: 'seoulCulture:158770',
            sourceId: '158770',
            source: 'seoulCulture',
            category: 'performance',
            title: '2026 카즈미 타테이시 트리오 내한공연-크리스마스, 재즈를 만나다-(서울)',
            startDate: '2026-12-24',
            endDate: '2026-12-24',
            venue: '강동아트센터 대극장 한강',
            region: '강동구',
            imageUrl: expect.stringMatching(/^https:\/\/culture\.seoul\.go\.kr\//),
            metrics: {},
        });
    });

    it('전시·축제·교육·영화는 제외', () => {
        const row = (CODENAME: string, cultcode: string) => ({
            CODENAME,
            GUNAME: '중구',
            TITLE: CODENAME,
            PLACE: '장소',
            MAIN_IMG: '',
            HMPG_ADDR: `https://culture.seoul.go.kr/view.do?cultcode=${cultcode}`,
            STRTDATE: '2026-10-01 00:00:00.0',
            END_DATE: '2026-10-30 00:00:00.0',
        });
        const text = JSON.stringify({
            culturalEventInfo: {
                RESULT: { CODE: 'INFO-000' },
                row: [row('전시/미술', '1'), row('축제-기타', '2'), row('교육/체험', '3'), row('영화', '4'), row('연극', '5')],
            },
        });
        expect(parseSeoulCulture(text).map((i) => i.sourceId)).toEqual(['5']);
    });

    it('잘못된 키는 JSON 경로여도 XML로 오고 AUTH_ERROR', () => {
        expect(codeOf(() => parseSeoulCulture(fixture('error.xml')))).toBe('AUTH_ERROR');
    });

    it('INFO-000이 아닌 결과 코드는 API_ERROR', () => {
        const text = JSON.stringify({ culturalEventInfo: { RESULT: { CODE: 'INFO-999', MESSAGE: 'x' }, row: [] } });
        expect(codeOf(() => parseSeoulCulture(text))).toBe('API_ERROR');
    });

    it('행이 없으면 EMPTY_RESPONSE', () => {
        const text = JSON.stringify({ culturalEventInfo: { RESULT: { CODE: 'INFO-000' }, row: [] } });
        expect(codeOf(() => parseSeoulCulture(text))).toBe('EMPTY_RESPONSE');
    });
});
