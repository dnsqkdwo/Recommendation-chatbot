// 사내 Holiday Module API로 영업일 판정. 주말은 CronJob이 거르므로 공휴일·사내 지정 휴일만 봄

import { SourceError } from './errors.js';
import { fetchJson } from './http.js';
import type { RunContext } from './types.js';

interface HolidayResponse {
    requestedDate?: string;
    isHoliday?: unknown;
}

/** 응답에서 isHoliday 반환. 휴일이 아니면 holidayDetail이 null로 와서 isHoliday만 봄 */
export function parseHoliday(json: unknown): boolean {
    const isHoliday = (json as HolidayResponse | null)?.isHoliday;
    if (typeof isHoliday !== 'boolean') throw new SourceError('PARSE_ERROR', 'isHoliday 없음');
    return isHoliday;
}

/**
 * date(YYYY-MM-DD, KST)가 영업일인지 판정. 휴일이면 false.
 * 호출·파싱 실패는 SourceError로 던짐
 */
export async function isBusinessDay(date: string, ctx: RunContext): Promise<boolean> {
    const base = ctx.env.HOLIDAY_API_URL.replace(/\/+$/, '');
    const params = new URLSearchParams({ target_date: date });
    const json = await fetchJson({ source: 'holiday', kind: 'business', url: `${base}/api/holiday?${params}` }, ctx);
    return !parseHoliday(json);
}
