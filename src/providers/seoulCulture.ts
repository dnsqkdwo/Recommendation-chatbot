// 서울 문화행사 정보. 필드 이름은 fixtures/seoulCulture/list.json, error.xml 기준

import { SourceError } from '../core/errors.js';
import { fetchText } from '../core/http.js';
import type { ContentItem, Provider, RunContext } from '../core/types.js';
import { parseXml } from '../core/xml.js';

const SUCCESS = 'INFO-000';
const INVALID_KEY = 'INFO-100';
const PAGE_END = 1000; // 시작일 늦는 순 정렬

const PERFORMANCE_CODES = new Set(['클래식', '콘서트', '국악', '연극', '무용', '뮤지컬/오페라', '독주/독창회']);

interface CulturalEvent {
    CODENAME: string;
    GUNAME: string;
    TITLE: string;
    PLACE: string;
    MAIN_IMG: string;
    HMPG_ADDR: string;
    STRTDATE: string;
    END_DATE: string;
    PROGRAM: string;
    ETC_DESC: string;
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
        // 상세 API가 없어 프로그램 소개·기타 내용을 설명문으로 씀. 본문에 <작품명> 같은 꺾쇠가 있어 태그 제거는 안 함
        const description = [r.PROGRAM, r.ETC_DESC]
            .map((t) => (t ?? '').trim())
            .filter(Boolean)
            .join('\n');
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
                link: r.HMPG_ADDR.trim(), // 서울문화포털 행사 페이지
                ...(r.MAIN_IMG.trim() ? { imageUrl: r.MAIN_IMG.trim() } : {}),
                genre: r.CODENAME,
                ...(description ? { description } : {}),
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
