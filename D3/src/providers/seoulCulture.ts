// 서울 문화행사 정보 (공연만). 필드 이름은 fixtures/seoulCulture/list.json, error.xml 기준

import { SourceError } from '../core/errors.js';
import { fetchText } from '../core/http.js';
import type { ContentItem, Provider, RunContext } from '../core/types.js';
import { parseXml } from '../core/xml.js';

const SUCCESS = 'INFO-000';
const INVALID_KEY = 'INFO-100';
const PAGE_END = 1000; // 시작일 늦은 순 정렬이라 1~1000행이면 진행·예정 공연을 덮음

// 전시·축제·교육 등은 공연이 아니므로 제외
const PERFORMANCE_CODES = new Set(['클래식', '콘서트', '국악', '연극', '무용', '뮤지컬/오페라', '독주/독창회']);

interface CulturalEvent {
    CODENAME: string;
    GUNAME: string;
    TITLE: string;
    PLACE: string;
    MAIN_IMG: string;
    HMPG_ADDR: string; // ...view.do?cultcode=158770&...
    STRTDATE: string; // 2026-12-24 00:00:00.0
    END_DATE: string;
}

interface Result {
    CODE?: string;
    MESSAGE?: string;
}

interface SeoulJson {
    culturalEventInfo?: { RESULT?: Result; row?: CulturalEvent[] };
    RESULT?: Result;
}

function throwIfError(result: Result | undefined): void {
    if (result?.CODE === undefined || result.CODE === SUCCESS) return;
    const message = (result.MESSAGE ?? '').split('\n')[0]?.trim() ?? '';
    throw new SourceError(result.CODE === INVALID_KEY ? 'AUTH_ERROR' : 'API_ERROR', `${result.CODE} ${message}`.trim());
}

/** 응답을 공연 ContentItem 목록으로 변환. INFO-100은 AUTH_ERROR, 그 밖의 오류 코드는 API_ERROR로 던짐 */
export function parseSeoulCulture(text: string): ContentItem[] {
    // JSON을 요청해도 오류는 XML(<RESULT><CODE>)로 옴
    if (text.trimStart().startsWith('<')) {
        throwIfError((parseXml(text) as { RESULT?: Result }).RESULT);
        throw new SourceError('PARSE_ERROR', 'JSON이 아닌 응답');
    }
    let json: SeoulJson;
    try {
        json = JSON.parse(text) as SeoulJson;
    } catch {
        throw new SourceError('PARSE_ERROR', 'JSON 파싱 실패');
    }
    throwIfError(json.RESULT);
    const info = json.culturalEventInfo;
    if (!info) throw new SourceError('PARSE_ERROR', 'culturalEventInfo 없음');
    throwIfError(info.RESULT);
    const rows = info.row ?? [];
    if (rows.length === 0) throw new SourceError('EMPTY_RESPONSE', '문화행사 0건');

    return rows.flatMap((r): ContentItem[] => {
        const cultcode = /[?&]cultcode=(\d+)/.exec(r.HMPG_ADDR)?.[1];
        if (!PERFORMANCE_CODES.has(r.CODENAME) || !cultcode) return [];
        return [
            {
                id: `seoulCulture:${cultcode}`,
                sourceId: cultcode,
                source: 'seoulCulture',
                category: 'performance',
                title: r.TITLE.trim(),
                startDate: r.STRTDATE.slice(0, 10),
                endDate: r.END_DATE.slice(0, 10),
                ...(r.PLACE.trim() ? { venue: r.PLACE.trim() } : {}),
                ...(r.GUNAME.trim() ? { region: r.GUNAME.trim() } : {}),
                ...(r.MAIN_IMG.trim() ? { imageUrl: r.MAIN_IMG.trim() } : {}),
                metrics: {},
            },
        ];
    });
}

// 키가 쿼리스트링이 아니라 URL 경로에 들어감
export const seoulCultureProvider: Provider = {
    name: 'seoulCulture',
    category: 'performance',
    async fetchList(ctx: RunContext) {
        const key = encodeURIComponent(ctx.env.SEOUL_OPENAPI_KEY);
        const url = `http://openapi.seoul.go.kr:8088/${key}/json/culturalEventInfo/1/${PAGE_END}/`;
        return parseSeoulCulture(await fetchText({ source: 'seoulCulture', kind: 'list', url }, ctx));
    },
};
