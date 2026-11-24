// 도서관 정보나루 대출 급상승 도서·도서 상세. 필드 이름은 fixtures/data4library/hottrend.json, detail.json, error.json 기준

import { kstDate } from '../core/clock.js';
import { SourceError } from '../core/errors.js';
import { fetchJson } from '../core/http.js';
import type { ContentItem, Provider, RunContext } from '../core/types.js';

const BASE_URL = 'http://data4library.kr/api';
const INVALID_KEY = 'authErr';

interface TrendDoc {
    no: number;
    bookname: string;
    authors: string;
    publisher: string;
    isbn13: string;
    bookImageURL: string;
    bookDtlUrl?: string;
}

interface Data4LibraryJson {
    response?: {
        errCode?: string;
        error?: string;
        results?: { result?: { date?: string; docs?: { doc: TrendDoc }[] } }[];
        detail?: { book?: { description?: string } }[];
    };
}

// 오류는 HTTP 200 + response.errCode로 옴
function unwrap(json: unknown): NonNullable<Data4LibraryJson['response']> {
    const res = (json as Data4LibraryJson).response;
    if (!res) throw new SourceError('PARSE_ERROR', 'response 없음');
    if (res.errCode) {
        throw new SourceError(res.errCode === INVALID_KEY ? 'AUTH_ERROR' : 'API_ERROR', `${res.errCode} ${res.error ?? ''}`.trim());
    }
    return res;
}

/**
 * 대출 급상승 응답을 서적 ContentItem 목록으로 변환. 같은 책은 ISBN 기준으로 가장 최근 날짜 것만 남김.
 * authErr는 AUTH_ERROR, 그 밖의 오류는 API_ERROR로 던짐
 */
export function parseHotTrend(json: unknown): ContentItem[] {
    const res = unwrap(json);
    if (!res.results) throw new SourceError('PARSE_ERROR', 'results 없음');
    // 날짜 최신순으로 오므로 먼저 나온 것을 유지
    const docs = res.results.flatMap((r) => r.result?.docs ?? []).map((d) => d.doc);
    const seen = new Set<string>();
    const unique = docs.filter((d) => !seen.has(d.isbn13) && seen.add(d.isbn13));
    if (unique.length === 0) throw new SourceError('EMPTY_RESPONSE', '급상승 도서 0건');

    return unique.map((d) => ({
        id: `data4library:${d.isbn13}`,
        sourceId: d.isbn13,
        source: 'data4library',
        category: 'book',
        title: d.bookname.trim(),
        ...(d.authors?.trim() ? { author: d.authors.trim() } : {}),
        ...(d.publisher?.trim() ? { publisher: d.publisher.trim() } : {}),
        ...(d.bookImageURL ? { imageUrl: d.bookImageURL } : {}),
        ...(d.bookDtlUrl?.trim() ? { link: d.bookDtlUrl.trim() } : {}),
        metrics: { rank: d.no },
    }));
}

/** 도서 상세 응답에서 책 소개 반환. 비어 있으면 null */
export function parseBookDetail(json: unknown): string | null {
    const book = unwrap(json).detail?.[0]?.book;
    return book?.description?.trim() || null;
}

// 전날 기준 대출 급상승 도서를 조회해 파싱된 목록으로 반환
export const data4libraryProvider: Provider = {
    name: 'data4library',
    category: 'book',
    async fetchList(ctx: RunContext) {
        const params = new URLSearchParams({ authKey: ctx.env.DATA4LIBRARY_AUTH_KEY, format: 'json', searchDt: kstDate(ctx.now(), -1) });
        const json = await fetchJson({ source: 'data4library', kind: 'hottrend', url: `${BASE_URL}/hotTrend?${params}` }, ctx);
        return parseHotTrend(json);
    },
    async fetchDetail(item: ContentItem, ctx: RunContext) {
        const params = new URLSearchParams({
            authKey: ctx.env.DATA4LIBRARY_AUTH_KEY,
            format: 'json',
            isbn13: item.sourceId,
            loaninfoYN: 'N',
        });
        const json = await fetchJson({ source: 'data4library', kind: 'detail', url: `${BASE_URL}/srchDtlList?${params}` }, ctx);
        return { description: parseBookDetail(json), facts: [] };
    },
};
