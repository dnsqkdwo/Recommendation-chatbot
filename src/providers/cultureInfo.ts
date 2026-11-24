// 한눈에보는문화정보 기간별 조회·상세. 필드 이름은 fixtures/cultureInfo/list.xml, detail.xml, error.xml 기준

import { kstDate } from '../core/clock.js';
import { SourceError, throwIfDataGoKrError } from '../core/errors.js';
import { fetchText } from '../core/http.js';
import { decodeEntities, htmlToText } from '../core/text.js';
import type { ContentItem, DetailInfo, Provider, RunContext } from '../core/types.js';
import { asArray, parseXml } from '../core/xml.js';

const BASE_URL = 'https://apis.data.go.kr/B553457/cultureinfo';
const SUCCESS = '00';
const ROWS = '1000';
const RANGE_DAYS = 7;

// 공연은 공연 분야와 겹치고 교육/체험은 모집 공고가 섞여 제외
const EVENT_SERVICES = new Set(['행사/축제', '전시']);

interface CultureEvent {
    serviceName: string;
    seq: string;
    title: string;
    startDate: string;
    endDate: string;
    place: string;
    area: string;
    thumbnail: string;
}

interface CultureXml {
    response?: {
        header?: { resultCode?: string; resultMsg?: string };
        body?: { items?: { item?: unknown } | '' };
    };
}

function parseBody<T>(text: string): T[] {
    const xml = parseXml(text) as CultureXml;
    throwIfDataGoKrError(xml);
    const header = xml.response?.header;
    if (!header) throw new SourceError('PARSE_ERROR', 'response.header 없음');
    if (header.resultCode !== SUCCESS) {
        throw new SourceError('API_ERROR', `${header.resultCode ?? ''} ${header.resultMsg ?? ''}`.trim());
    }
    const items = xml.response?.body?.items;
    return items ? (asArray(items.item) as T[]) : [];
}

const toIsoDate = (yyyymmdd: string): string =>
    `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

// 제목·장소가 두 번 인코딩되어 옴
const clean = (value: string): string => decodeEntities(value).trim();

/** 기간별 조회 응답을 행사·전시 ContentItem 목록으로 변환. 미등록 키는 AUTH_ERROR, 그 밖의 오류는 API_ERROR로 던짐 */
export function parseCultureInfo(text: string): ContentItem[] {
    const list = parseBody<CultureEvent>(text);
    if (list.length === 0) throw new SourceError('EMPTY_RESPONSE', '문화정보 0건');

    return list
        .filter((e) => EVENT_SERVICES.has(e.serviceName))
        .map((e) => ({
            id: `cultureInfo:${e.seq}`,
            sourceId: e.seq,
            source: 'cultureInfo',
            category: 'event',
            title: clean(e.title),
            ...(e.startDate ? { startDate: toIsoDate(e.startDate) } : {}),
            ...(e.endDate ? { endDate: toIsoDate(e.endDate) } : {}),
            ...(clean(e.place) ? { venue: clean(e.place) } : {}),
            ...(e.area ? { region: e.area } : {}),
            ...(e.thumbnail ? { imageUrl: e.thumbnail } : {}),
            genre: e.serviceName,
            metrics: {},
        }));
}

/** 상세 응답에서 소개문·관람료·안내 페이지 링크 반환. 소개문은 빈 값이 많아 비어 있으면 description은 null. 링크는 목록에선 행사·전시가 빈 값이라 상세에서 가져옴 */
export function parseCultureInfoDetail(text: string): DetailInfo {
    const item = parseBody<{ contents1?: string; price?: string; url?: string }>(text)[0];
    const price = item?.price ? clean(item.price) : '';
    const link = item?.url ? clean(item.url) : '';
    return {
        description: item?.contents1 ? htmlToText(item.contents1) || null : null,
        facts: price ? [{ label: '관람료', value: price }] : [],
        ...(link.startsWith('http') ? { link } : {}),
    };
}

// 오늘부터 7일 안에 진행되는 행사를 조회해 파싱된 목록으로 반환
export const cultureInfoProvider: Provider = {
    name: 'cultureInfo',
    category: 'event',
    async fetchList(ctx: RunContext) {
        const params = new URLSearchParams({
            serviceKey: ctx.env.DATA_GO_KR_SERVICE_KEY,
            from: kstDate(ctx.now()).replaceAll('-', ''),
            to: kstDate(ctx.now(), RANGE_DAYS).replaceAll('-', ''),
            PageNo: '1',
            numOfrows: ROWS,
        });
        const text = await fetchText({ source: 'cultureInfo', kind: 'list', url: `${BASE_URL}/period2?${params}` }, ctx);
        return parseCultureInfo(text);
    },
    async fetchDetail(item: ContentItem, ctx: RunContext) {
        const params = new URLSearchParams({ serviceKey: ctx.env.DATA_GO_KR_SERVICE_KEY, seq: item.sourceId });
        const text = await fetchText({ source: 'cultureInfo', kind: 'detail', url: `${BASE_URL}/detail2?${params}` }, ctx);
        return parseCultureInfoDetail(text);
    },
};
