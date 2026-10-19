// KMDb 영화 검색. 상세 조회 전용이라 등록부에 넣지 않음. 필드 이름은 fixtures/kmdb/list.json, error.txt 기준

import { SourceError } from '../core/errors.js';
import { fetchText } from '../core/http.js';
import { normalizeTitle } from '../core/text.js';
import type { RunContext } from '../core/types.js';

const SEARCH_URL = 'https://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp';

interface KmdbMovie {
    title: string; // 검색어 앞뒤에 ' !HS ', ' !HE ' 강조 표시가 섞임
    prodYear: string;
    repRlsDate: string; // YYYYMMDD, 빈 값일 수 있음
    plots?: { plot?: { plotLang: string; plotText: string }[] };
}

interface KmdbResponse {
    Data?: { Result?: KmdbMovie[] }[];
}

export const cleanKmdbTitle = (title: string): string => title.replace(/\s*!H[SE]\s*/g, ' ').trim();

/** 검색 응답 본문에서 제목·연도가 맞는 영화의 한국어 줄거리 반환. 맞는 영화가 없으면 null */
export function parseKmdbPlot(text: string, title: string, openYear: string): string | null {
    // 오류는 HTTP 200 + JSON이 아닌 본문 ({ "Error" : 인증키가 필요합니다. })
    const error = /"Error"\s*:\s*([^}]*)/.exec(text)?.[1]?.trim();
    if (error !== undefined) {
        throw new SourceError(error.includes('인증키') ? 'AUTH_ERROR' : 'API_ERROR', error);
    }
    let json: KmdbResponse;
    try {
        json = JSON.parse(text) as KmdbResponse;
    } catch {
        throw new SourceError('PARSE_ERROR', 'JSON 파싱 실패');
    }
    if (!json.Data) throw new SourceError('PARSE_ERROR', 'Data 없음');

    const key = normalizeTitle(title);
    const movie = (json.Data[0]?.Result ?? []).find(
        (m) =>
            normalizeTitle(cleanKmdbTitle(m.title)) === key &&
            (m.repRlsDate.startsWith(openYear) || m.prodYear === openYear),
    );
    const plots = movie?.plots?.plot ?? [];
    const plot = plots.find((p) => p.plotLang === '한국어') ?? plots[0];
    return plot?.plotText.trim() || null;
}

/** 제목으로 검색해 openYear(YYYY)에 개봉·제작된 영화의 줄거리 반환. 없으면 null */
export async function findMoviePlot(title: string, openYear: string, ctx: RunContext): Promise<string | null> {
    const params = new URLSearchParams({
        collection: 'kmdb_new2',
        ServiceKey: ctx.env.KMDB_API_KEY,
        detail: 'Y',
        title,
        listCount: '10',
    });
    const text = await fetchText({ source: 'kmdb', kind: 'list', url: `${SEARCH_URL}?${params}` }, ctx);
    return parseKmdbPlot(text, title, openYear);
}
