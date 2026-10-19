// KOPIS 예매상황판·공연 상세. 필드 이름은 fixtures/kopis/boxoffice.xml, detail.xml, error.xml 기준

import { kstDate } from '../core/clock.js';
import { SourceError } from '../core/errors.js';
import { fetchText } from '../core/http.js';
import type { ContentItem, Provider, RunContext } from '../core/types.js';
import { asArray, parseXml } from '../core/xml.js';

const BASE_URL = 'https://www.kopis.or.kr/openApi/restful';
const INVALID_KEY = '02';

interface BoxOffice {
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

interface KopisXml {
    boxofs?: { boxof?: BoxOffice | BoxOffice[] } | '';
    dbs?: { db?: (KopisError & { sty?: string }) | (KopisError & { sty?: string })[] } | '';
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
            metrics: { rank: Number(b.rnum) },
        };
    });
}

/** 공연 상세 XML에서 소개문(sty) 반환. 비어 있으면 null */
export function parseKopisDetail(text: string): string | null {
    const xml = parseXml(text) as KopisXml;
    throwIfError(xml);
    const db = xml.dbs ? asArray(xml.dbs.db)[0] : undefined;
    if (!db) throw new SourceError('PARSE_ERROR', 'dbs.db 없음');
    return db.sty?.trim() || null;
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
