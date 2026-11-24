// 국립중앙도서관 사서추천도서. 필드 이름은 fixtures/nlRecommend/list.xml, error.xml 기준

import { kstDate } from '../core/clock.js';
import { SourceError } from '../core/errors.js';
import { fetchText } from '../core/http.js';
import { decodeEntities, htmlToText } from '../core/text.js';
import type { ContentItem, Provider, RunContext } from '../core/types.js';
import { asArray, parseXml } from '../core/xml.js';

const LIST_URL = 'https://nl.go.kr/NL/search/openApi/saseoApi.do';
const INVALID_KEY = '011';
const RANGE_DAYS = 365;
const ROWS = '200'; // 최근 1년 추천을 1회에 받음

interface Recommendation {
    recomNo: string;
    recomtitle: string;
    recomauthor: string;
    recompublisher: string;
    recomcontens: string;
}

interface NlXml {
    channel?: { totalCount?: string; list?: unknown };
    error?: { msg?: string; error_code?: string };
}

/** 사서추천 응답을 서적 ContentItem 목록으로 변환. 오류 011은 AUTH_ERROR, 그 밖의 오류는 API_ERROR로 던짐 */
export function parseNlRecommend(text: string): ContentItem[] {
    const xml = parseXml(text) as NlXml;
    if (xml.error) {
        const { error_code = '', msg = '' } = xml.error;
        throw new SourceError(error_code === INVALID_KEY ? 'AUTH_ERROR' : 'API_ERROR', `${error_code} ${msg}`.trim());
    }
    if (!xml.channel) throw new SourceError('PARSE_ERROR', 'channel 없음');
    // 항목마다 <list><item>으로 감싸져 옴
    const list = asArray(xml.channel.list).flatMap((l) => asArray((l as { item?: unknown }).item)) as Recommendation[];
    if (list.length === 0) throw new SourceError('EMPTY_RESPONSE', '사서추천 0건');

    return list.map((r) => ({
        id: `nlRecommend:${r.recomNo}`,
        sourceId: r.recomNo,
        source: 'nlRecommend',
        category: 'book',
        title: decodeEntities(r.recomtitle).trim(),
        ...(r.recomauthor?.trim() ? { author: decodeEntities(r.recomauthor).trim() } : {}),
        ...(r.recompublisher?.trim() ? { publisher: decodeEntities(r.recompublisher).trim() } : {}),
        // 상세 API가 없어 목록의 소개문을 바로 씀. 최근 자료는 HTML 태그가 섞여 옴
        ...(r.recomcontens?.trim() ? { description: htmlToText(r.recomcontens) } : {}),
        metrics: { recommended: true },
    }));
}

// 최근 1년 추천을 최신 추천순으로 조회. 기간 없이 조회하면 요청 행 수에 따라 정렬이 달라짐
export const nlRecommendProvider: Provider = {
    name: 'nlRecommend',
    category: 'book',
    async fetchList(ctx: RunContext) {
        const params = new URLSearchParams({
            key: ctx.env.NL_API_KEY,
            startRowNumApi: '1',
            endRowNumApi: ROWS,
            start_date: kstDate(ctx.now(), -RANGE_DAYS).replaceAll('-', ''),
            end_date: kstDate(ctx.now()).replaceAll('-', ''),
        });
        const text = await fetchText({ source: 'nlRecommend', kind: 'list', url: `${LIST_URL}?${params}` }, ctx);
        return parseNlRecommend(text);
    },
};
