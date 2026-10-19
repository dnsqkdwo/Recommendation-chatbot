// KOBIS 일별 박스오피스. 필드 이름은 fixtures/kobis/list.json, error.json 기준

import { kstDate } from '../core/clock.js';
import { SourceError } from '../core/errors.js';
import { fetchJson } from '../core/http.js';
import type { ContentItem, Provider, RunContext } from '../core/types.js';

const LIST_URL = 'https://kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json';
const INVALID_KEY = '320010';

interface DailyBoxOffice {
    rank: string;
    rankOldAndNew: string;
    movieCd: string;
    movieNm: string;
    openDt: string;
    audiAcc: string;
}

interface KobisResponse {
    boxOfficeResult?: { dailyBoxOfficeList?: DailyBoxOffice[] };
    faultInfo?: { message?: string; errorCode?: string };
}

/** KOBIS 응답을 ContentItem 목록으로 변환. 오류 320010은 AUTH_ERROR, 그 밖의 오류는 API_ERROR로 던짐 */
export function parseKobisList(json: unknown): ContentItem[] {
    const res = json as KobisResponse;
    if (res.faultInfo) {
        const { errorCode = '', message = '' } = res.faultInfo;
        throw new SourceError(errorCode === INVALID_KEY ? 'AUTH_ERROR' : 'API_ERROR', `${errorCode} ${message}`.trim());
    }
    const list = res.boxOfficeResult?.dailyBoxOfficeList;
    if (!list) throw new SourceError('PARSE_ERROR', 'boxOfficeResult.dailyBoxOfficeList 없음');
    if (list.length === 0) throw new SourceError('EMPTY_RESPONSE', '박스오피스 0건');

    return list.map((m) => ({
        id: `kobis:${m.movieCd}`,
        sourceId: m.movieCd,
        source: 'kobis',
        category: 'movie',
        title: m.movieNm.trim(),
        ...(m.openDt.trim() ? { startDate: m.openDt.trim() } : {}),
        metrics: {
            rank: Number(m.rank),
            audience: Number(m.audiAcc),
            isNew: m.rankOldAndNew === 'NEW',
        },
    }));
}

// 전날 기준 박스오피스 순위를 조회해 파싱된 목록으로 반환
export const kobisProvider: Provider = {
    name: 'kobis',
    category: 'movie',
    async fetchList(ctx: RunContext) {
        const params = new URLSearchParams({
            key: ctx.env.KOBIS_API_KEY,
            targetDt: kstDate(ctx.now(), -1).replaceAll('-', ''), // 일별 박스오피스는 전날 통계까지 집계
        });
        const json = await fetchJson({ source: 'kobis', kind: 'list', url: `${LIST_URL}?${params}` }, ctx);
        return parseKobisList(json);
    },
};
