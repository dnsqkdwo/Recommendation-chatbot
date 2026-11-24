// KOPIS 예매상황판·공연 상세. 필드 이름은 fixtures/kopis/boxoffice.xml, detail.xml, error.xml 기준

import { kstDate } from '../core/clock.js';
import { SourceError } from '../core/errors.js';
import { fetchText } from '../core/http.js';
import type { ContentItem, DetailInfo, Fact, Provider, RunContext } from '../core/types.js';
import { asArray, parseXml } from '../core/xml.js';

const BASE_URL = 'https://www.kopis.or.kr/openApi/restful';
const INVALID_KEY = '02';

interface BoxOffice {
    cate: string;
    rnum: string;
    prfnm: string;
    prfpd: string; // 2026.12.05~2026.12.06
    area: string;
    prfplcnm: string;
    poster: string;
    mt20id: string;
}

interface KopisError {
    returncode?: string;
    errmsg?: string;
}

interface KopisDb extends KopisError {
    sty?: string;
    prfcast?: string;
    prfruntime?: string;
    prfage?: string;
    relates?: { relate?: { relatenm?: string; relateurl?: string } | { relatenm?: string; relateurl?: string }[] } | '';
}

// 값이 있는 항목만 표시. 소개문은 예매상황판 공연 대부분이 이미지로만 있어 빈 값
const FACT_FIELDS = [
    ['prfcast', '출연'],
    ['prfruntime', '공연시간'],
    ['prfage', '관람연령'],
] as const;

interface KopisXml {
    boxofs?: { boxof?: BoxOffice | BoxOffice[] } | '';
    dbs?: { db?: KopisDb | KopisDb[] } | '';
}

// 오류는 HTTP 200 + <dbs><db><returncode>로 옴
function throwIfError(xml: KopisXml): void {
    const db = xml.dbs ? asArray(xml.dbs.db)[0] : undefined;
    if (db?.returncode === undefined) return;
    const { returncode, errmsg = '' } = db;
    throw new SourceError(returncode === INVALID_KEY ? 'AUTH_ERROR' : 'API_ERROR', `${returncode} ${errmsg}`.trim());
}

const toIsoDate = (dotted: string): string => dotted.trim().replaceAll('.', '-');

/** 예매상황판 XML을 ContentItem 목록으로 변환. returncode 02는 AUTH_ERROR, 그 밖의 오류는 API_ERROR로 던짐 */
export function parseKopisBoxOffice(text: string): ContentItem[] {
    const xml = parseXml(text) as KopisXml;
    throwIfError(xml);
    if (xml.boxofs === undefined) throw new SourceError('PARSE_ERROR', 'boxofs 없음');
    const list = asArray(xml.boxofs === '' ? undefined : xml.boxofs.boxof);
    if (list.length === 0) throw new SourceError('EMPTY_RESPONSE', '예매상황판 0건');

    return list.map((b) => {
        const [from = '', to = ''] = b.prfpd.split('~');
        return {
            id: `kopis:${b.mt20id}`,
            sourceId: b.mt20id,
            source: 'kopis',
            category: 'performance',
            title: b.prfnm,
            ...(from ? { startDate: toIsoDate(from) } : {}),
            ...(to ? { endDate: toIsoDate(to) } : {}),
            ...(b.prfplcnm ? { venue: b.prfplcnm } : {}),
            ...(b.area ? { region: b.area } : {}),
            ...(b.poster ? { imageUrl: b.poster } : {}),
            ...(b.cate ? { genre: b.cate } : {}),
            metrics: { rank: Number(b.rnum) },
        };
    });
}

/** 공연 상세 XML에서 소개문과 출연·공연시간·관람연령 반환. 소개문이 비어 있으면 description은 null */
export function parseKopisDetail(text: string): DetailInfo {
    const xml = parseXml(text) as KopisXml;
    throwIfError(xml);
    const db = xml.dbs ? asArray(xml.dbs.db)[0] : undefined;
    if (!db) throw new SourceError('PARSE_ERROR', 'dbs.db 없음');
    const facts: Fact[] = FACT_FIELDS.flatMap(([field, label]) => {
        const value = db[field]?.trim();
        return value ? [{ label, value }] : [];
    });
    // 예매처가 여러 곳이면 첫 번째 링크
    const link = asArray(db.relates ? db.relates.relate : undefined)
        .map((r) => r.relateurl?.trim() ?? '')
        .find((url) => url.startsWith('http'));
    return { description: db.sty?.trim() || null, facts, ...(link ? { link } : {}) };
}

// 전날 예매상황판 순위를 조회해 파싱된 목록으로 반환
export const kopisProvider: Provider = {
    name: 'kopis',
    category: 'performance',
    async fetchList(ctx: RunContext) {
        const day = kstDate(ctx.now(), -1).replaceAll('-', '');
        const params = new URLSearchParams({ service: ctx.env.KOPIS_SERVICE_KEY, stdate: day, eddate: day });
        const text = await fetchText({ source: 'kopis', kind: 'boxoffice', url: `${BASE_URL}/boxoffice?${params}` }, ctx);
        return parseKopisBoxOffice(text);
    },
    async fetchDetail(item: ContentItem, ctx: RunContext) {
        const params = new URLSearchParams({ service: ctx.env.KOPIS_SERVICE_KEY });
        const url = `${BASE_URL}/pblprfr/${encodeURIComponent(item.sourceId)}?${params}`;
        return parseKopisDetail(await fetchText({ source: 'kopis', kind: 'detail', url }, ctx));
    },
};
