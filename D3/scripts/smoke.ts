// 소스별 API 1회 호출 → fixtures/<source>/<kind>.json|xml 저장
// 사용법: yarn smoke      
// URL·키는 콘솔과 파일 어디에도 남기지 않음. 저장·출력 전에 redact()를 거침

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { initRedact, redact } from '../src/core/redact.js';

const SECRET_KEYS = [
    'DATA_GO_KR_SERVICE_KEY',
    'KOBIS_API_KEY',
    'KMDB_API_KEY',
    'KOPIS_SERVICE_KEY',
    'SEOUL_OPENAPI_KEY',
    'NL_API_KEY',
    'DATA4LIBRARY_AUTH_KEY',
    'OPENROUTER_API_KEY',
    'MATTERMOST_WEBHOOK_URL',
    'MATTERMOST_ADMIN_WEBHOOK_URL',
];
initRedact(SECRET_KEYS.map((k) => process.env[k]));

// 환경변수 값을 앞뒤 공백 없이 반환. 없으면 빈 문자열
const env = (name: string): string => process.env[name]?.trim() ?? '';

// KST 기준 YYYYMMDD. offsetDays만큼 날짜 이동
function kstDate(offsetDays = 0): string {
    const d = new Date(Date.now() + 9 * 3600_000 + offsetDays * 86400_000);
    return d.toISOString().slice(0, 10).replaceAll('-', '');
}

// KST 기준 YYYY-MM-DD
function isoDate(offsetDays = 0): string {
    const d = kstDate(offsetDays);
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

const firstMatch = (body: string, re: RegExp): string | null => re.exec(body)?.[1] ?? null;

const qs = (params: Record<string, string>) => new URLSearchParams(params).toString();

interface Step {
    source: string;
    kind: string; // 파일 이름 (list, boxoffice ...)
    url: () => string;
    timeoutMs?: number;
    /** 목록 응답에서 상세 조회 URL 생성. null이면 상세 생략 */
    detail?: (body: string) => string | null;
}

const TOUR_COMMON = { MobileOS: 'ETC', MobileApp: 'recommendation-chatbot', _type: 'json' };

const steps: Step[] = [
    {
        source: 'kobis',
        kind: 'list',
        url: () =>
            'https://kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json?' +
            qs({ key: env('KOBIS_API_KEY'), targetDt: kstDate(-1) }),
        detail: (body) => {
            const movieCd = firstMatch(body, /"movieCd":\s*"([^"]+)"/);
            return movieCd
                ? 'https://kobis.or.kr/kobisopenapi/webservice/rest/movie/searchMovieInfo.json?' +
                        qs({ key: env('KOBIS_API_KEY'), movieCd })
                : null;
        },
    },
    {
        // 상세 조회 전용 소스. 검색 결과 자체가 줄거리를 담은 상세 응답
        source: 'kmdb',
        kind: 'list',
        url: () =>
            'https://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp?' +
            qs({ collection: 'kmdb_new2', ServiceKey: env('KMDB_API_KEY'), detail: 'Y', title: '기생충', listCount: '3' }),
    },
    {
        source: 'kopis',
        kind: 'list',
        url: () =>
            'https://www.kopis.or.kr/openApi/restful/pblprfr?' +
            qs({ service: env('KOPIS_SERVICE_KEY'), stdate: kstDate(0), eddate: kstDate(30), cpage: '1', rows: '10' }),
        detail: (body) => {
            const id = firstMatch(body, /<mt20id>([^<]+)<\/mt20id>/);
            return id
                ? `https://www.kopis.or.kr/openApi/restful/pblprfr/${encodeURIComponent(id)}?` +
                        qs({ service: env('KOPIS_SERVICE_KEY') })
                : null;
        },
    },
    {
        // ststype/date 조합은 INVALID REQUEST PARAMETER. stdate/eddate로 받음
        source: 'kopis',
        kind: 'boxoffice',
        url: () =>
            'https://www.kopis.or.kr/openApi/restful/boxoffice?' +
            qs({ service: env('KOPIS_SERVICE_KEY'), stdate: kstDate(-1), eddate: kstDate(-1) }),
    },
    {
        source: 'seoulCulture',
        kind: 'list',
        url: () => `http://openapi.seoul.go.kr:8088/${encodeURIComponent(env('SEOUL_OPENAPI_KEY'))}/json/culturalEventInfo/1/1000/`, // 조회 범위 1000행
    },
    {
        source: 'tourApi',
        kind: 'list',
        url: () =>
            'https://apis.data.go.kr/B551011/KorService2/searchFestival2?' +
            qs({
                serviceKey: env('DATA_GO_KR_SERVICE_KEY'),
                ...TOUR_COMMON,
                eventStartDate: kstDate(0),
                numOfRows: '10',
                pageNo: '1',
            }),
        detail: (body) => {
            const contentId = firstMatch(body, /"contentid":\s*"([^"]+)"/);
            return contentId
                ? 'https://apis.data.go.kr/B551011/KorService2/detailCommon2?' +
                        qs({ serviceKey: env('DATA_GO_KR_SERVICE_KEY'), ...TOUR_COMMON, contentId })
                : null;
        },
    },
    {
        // XML 전용. 파라미터 이름 대소문자가 PageNo, numOfrows로 특이함
        source: 'cultureInfo',
        kind: 'list',
        url: () =>
            'https://apis.data.go.kr/B553457/cultureinfo/period2?' +
            qs({ serviceKey: env('DATA_GO_KR_SERVICE_KEY'), from: kstDate(0), to: kstDate(7), PageNo: '1', numOfrows: '10' }),
        detail: (body) => {
            const seq = firstMatch(body, /<seq>([^<]+)<\/seq>/);
            return seq
                ? 'https://apis.data.go.kr/B553457/cultureinfo/detail2?' +
                        qs({ serviceKey: env('DATA_GO_KR_SERVICE_KEY'), seq })
                : null;
        },
    },
    {
        source: 'festivalStd',
        kind: 'list',
        url: () =>
            'https://api.data.go.kr/openapi/tn_pubr_public_cltur_fstvl_api?' +
            qs({ serviceKey: env('DATA_GO_KR_SERVICE_KEY'), pageNo: '1', numOfRows: '10', type: 'json' }),
    },
    {
        source: 'nlRecommend',
        kind: 'list',
        url: () =>
            'https://nl.go.kr/NL/search/openApi/saseoApi.do?' +
            qs({ key: env('NL_API_KEY'), startRowNumApi: '1', endRowNumApi: '10' }),
    },
    {
        source: 'data4library',
        kind: 'list',
        url: () =>
            'http://data4library.kr/api/loanItemSrch?' +
            qs({
                authKey: env('DATA4LIBRARY_AUTH_KEY'),
                format: 'json',
                // 기간이 없거나 서버에 캐시되지 않은 기간이면 20초 넘게 걸림
                startDt: isoDate(-7),
                endDt: isoDate(-1),
                pageNo: '1',
                pageSize: '10',
            }),
        timeoutMs: 60_000,
        detail: (body) => {
            const isbn13 = firstMatch(body, /"isbn13":\s*"([^"]+)"/);
            return isbn13
                ? 'http://data4library.kr/api/srchDtlList?' +
                        qs({ authKey: env('DATA4LIBRARY_AUTH_KEY'), format: 'json', isbn13, loaninfoYN: 'N' })
                : null;
        },
    },
    {
        // 대출 급상승 도서. loanItemSrch보다 훨씬 빠름
        source: 'data4library',
        kind: 'hottrend',
        url: () =>
            'http://data4library.kr/api/hotTrend?' +
            qs({ authKey: env('DATA4LIBRARY_AUTH_KEY'), format: 'json', searchDt: isoDate(-1) }),
    },
    {
        source: 'seoulLibrary',
        kind: 'list',
        url: () =>
            `http://openapi.seoul.go.kr:8088/${encodeURIComponent(env('SEOUL_OPENAPI_KEY'))}/json/SeoulLibNewArrivalInfo/1/10/`,
    },
];

async function call(url: string, timeoutMs: number): Promise<{ status: number; body: string } | { error: string }> {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        return { status: res.status, body: await res.text() };
    } catch (e) {
        const err = e as Error & { cause?: { code?: string } };
        return { error: `${err.name}: ${err.message}${err.cause?.code ? ` (${err.cause.code})` : ''}` };
    }
}

function format(body: string): { ext: string; text: string } {
    const head = body.trimStart();
    if (head.startsWith('{') || head.startsWith('[')) {
        try {
            return { ext: 'json', text: JSON.stringify(JSON.parse(body), null, 2) };
        } catch {
            return { ext: 'json', text: body };
        }
    }
    if (head.startsWith('<')) return { ext: 'xml', text: body };
    return { ext: 'txt', text: body };
}

async function save(source: string, kind: string, body: string): Promise<string> {
    const { ext, text } = format(body);
    const dir = path.join('fixtures', source);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${kind}.${ext}`);
    await writeFile(file, redact(text), 'utf8');
    return file;
}

async function runStep(source: string, kind: string, url: string, timeoutMs = 10_000): Promise<string | null> {
    const started = Date.now();
    const result = await call(url, timeoutMs);
    const ms = Date.now() - started;
    if ('error' in result) {
        console.log(`${source}/${kind}  실패  ${ms}ms  ${redact(result.error)}`);
        return null;
    }
    const file = await save(source, kind, result.body);
    const preview = redact(result.body.replace(/\s+/g, ' ').slice(0, 200));
    console.log(`${source}/${kind}  HTTP ${result.status}  ${ms}ms  ${result.body.length}B  → ${file}\n  ${preview}`);
    return result.body;
}

const only = process.argv.slice(2);
const targets = only.length > 0 ? steps.filter((s) => only.includes(s.source)) : steps;

await Promise.all(
    targets.map(async (step) => {
        const body = await runStep(step.source, step.kind, step.url(), step.timeoutMs);
        if (body === null || !step.detail) return;
        const detailUrl = step.detail(body);
        if (detailUrl) await runStep(step.source, 'detail', detailUrl);
    }),
);
