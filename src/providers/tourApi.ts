// 한국관광공사 축제·행사 검색과 공통 상세. 필드 이름은 fixtures/tourApi/list.json, detail.json, error.json 기준

import { kstDate } from '../core/clock.js';
import { SourceError, throwIfDataGoKrError } from '../core/errors.js';
import { fetchText } from '../core/http.js';
import type { ContentItem, Provider, RunContext } from '../core/types.js';
import { parseXml } from '../core/xml.js';

const BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';
const COMMON = { MobileOS: 'ETC', MobileApp: 'recommendation-chatbot', _type: 'json' };
const SUCCESS = '0000';
const ROWS = '500'; // 진행·예정 축제 전체를 1회에 받음

interface Festival {
    contentid: string;
    title: string;
    addr1: string;
    eventstartdate: string;
    eventenddate: string;
    firstimage: string;
}

interface TourJson<T> {
    response?: {
        header?: { resultCode?: string; resultMsg?: string };
        body?: { items?: { item?: T[] } | '' };
    };
}

// 게이트웨이 오류는 JSON 또는 XML로 옴
function parseBody<T>(text: string): T[] {
    if (text.trimStart().startsWith('<')) {
        throwIfDataGoKrError(parseXml(text));
        throw new SourceError('PARSE_ERROR', 'JSON이 아닌 응답');
    }
    let json: TourJson<T>;
    try {
        json = JSON.parse(text) as TourJson<T>;
    } catch {
        throw new SourceError('PARSE_ERROR', 'JSON 파싱 실패');
    }
    throwIfDataGoKrError(json);
    const header = json.response?.header;
    if (!header) throw new SourceError('PARSE_ERROR', 'response.header 없음');
    if (header.resultCode !== SUCCESS) {
        throw new SourceError('API_ERROR', `${header.resultCode ?? ''} ${header.resultMsg ?? ''}`.trim());
    }
    const items = json.response?.body?.items;
    return items ? (items.item ?? []) : [];
}

const toIsoDate = (yyyymmdd: string): string =>
    `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

/** 축제 검색 응답을 행사 ContentItem 목록으로 변환. 미등록 키는 AUTH_ERROR, 그 밖의 오류는 API_ERROR로 던짐 */
export function parseTourFestivals(text: string): ContentItem[] {
    const list = parseBody<Festival>(text);
    if (list.length === 0) throw new SourceError('EMPTY_RESPONSE', '축제 0건');

    return list.map((f) => ({
        id: `tourApi:${f.contentid}`,
        sourceId: f.contentid,
        source: 'tourApi',
        category: 'event',
        title: f.title.trim(),
        ...(f.eventstartdate ? { startDate: toIsoDate(f.eventstartdate) } : {}),
        ...(f.eventenddate ? { endDate: toIsoDate(f.eventenddate) } : {}),
        ...(f.addr1.trim() ? { venue: f.addr1.trim() } : {}),
        ...(f.firstimage ? { imageUrl: f.firstimage } : {}),
        metrics: {},
    }));
}

/** 공통 상세 응답에서 소개문 반환. 비어 있으면 null */
export function parseTourDetail(text: string): string | null {
    const item = parseBody<{ overview?: string }>(text)[0];
    return item?.overview?.trim() || null;
}

/** 상세의 homepage에서 첫 http 주소 반환. 값이 <a href="..."> 형태로 오기도 해서 주소만 뽑음 */
export function parseTourHomepage(text: string): string | null {
    const homepage = parseBody<{ homepage?: string }>(text)[0]?.homepage ?? '';
    return /https?:\/\/[^\s"'<>]+/.exec(homepage)?.[0] ?? null;
}

// 오늘 이후 끝나는 축제(진행 중 포함)를 조회해 파싱된 목록으로 반환
export const tourApiProvider: Provider = {
    name: 'tourApi',
    category: 'event',
    async fetchList(ctx: RunContext) {
        const params = new URLSearchParams({
            serviceKey: ctx.env.DATA_GO_KR_SERVICE_KEY,
            ...COMMON,
            eventStartDate: kstDate(ctx.now()).replaceAll('-', ''),
            numOfRows: ROWS,
            pageNo: '1',
        });
        const text = await fetchText({ source: 'tourApi', kind: 'list', url: `${BASE_URL}/searchFestival2?${params}` }, ctx);
        return parseTourFestivals(text);
    },
    async fetchDetail(item: ContentItem, ctx: RunContext) {
        const params = new URLSearchParams({ serviceKey: ctx.env.DATA_GO_KR_SERVICE_KEY, ...COMMON, contentId: item.sourceId });
        const text = await fetchText({ source: 'tourApi', kind: 'detail', url: `${BASE_URL}/detailCommon2?${params}` }, ctx);
        const link = parseTourHomepage(text);
        return { description: parseTourDetail(text), facts: [], ...(link ? { link } : {}) };
    },
};
