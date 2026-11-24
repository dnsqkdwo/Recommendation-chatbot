import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isBusinessDay, parseHoliday } from '../../src/core/businessDay.js';
import { SourceError } from '../../src/core/errors.js';
import type { RunContext } from '../../src/core/types.js';

const fixture = (name: string): unknown => JSON.parse(readFileSync(`fixtures/holiday/${name}.json`, 'utf8'));

const ctx = (useFixtures: boolean) =>
    ({
        now: () => new Date('2026-11-02T16:30:00+09:00'),
        useFixtures,
        httpTimeoutMs: 1000,
        env: { HOLIDAY_API_URL: 'https://holiday.test/holiday/' },
    }) as unknown as RunContext;

afterEach(() => vi.unstubAllGlobals());

describe('parseHoliday', () => {
    it('평일·휴일 응답에서 isHoliday 반환', () => {
        expect(parseHoliday(fixture('business'))).toBe(false);
        expect(parseHoliday(fixture('holiday'))).toBe(true);
    });

    it('isHoliday가 없으면 PARSE_ERROR (400 응답 본문 등)', () => {
        expect(() => parseHoliday(fixture('error'))).toThrow(SourceError);
    });
});

describe('isBusinessDay', () => {
    it('fixture 모드는 평일 응답을 읽어 영업일', async () => {
        await expect(isBusinessDay('2026-11-02', ctx(true))).resolves.toBe(true);
    });

    it('주소 끝 /를 정리하고 target_date로 호출, 휴일이면 false', async () => {
        const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify(fixture('holiday')), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        await expect(isBusinessDay('2026-01-01', ctx(false))).resolves.toBe(false);
        expect(fetchMock.mock.calls[0]?.[0]).toBe('https://holiday.test/holiday/api/holiday?target_date=2026-01-01');
    });

    it('HTTP 400이면 HTTP_ERROR로 던짐', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(fixture('error')), { status: 400 })));
        await expect(isBusinessDay('2025-01-01', ctx(false))).rejects.toMatchObject({ code: 'HTTP_ERROR' });
    });
});
