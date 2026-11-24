// 모든 API 호출 담당.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SourceError } from './errors.js';
import { redact } from './redact.js';
import type { RunContext, SourceName } from './types.js';

// fixtures/ 아래 폴더 이름. 소스 외에 LLM·휴일 응답도 같은 방식으로 저장
export type FixtureDir = SourceName | 'llm' | 'holiday';

export interface HttpRequest {
    source: FixtureDir;
    kind: string;
    url: string;
}

export interface PostRequest extends HttpRequest {
    headers: Record<string, string>;
    body: unknown;
    timeoutMs: number;
}

/** GET 호출 후 본문 반환. 타임아웃·HTTP 오류·빈 본문은 SourceError로 던짐 */
export async function fetchText(req: HttpRequest, ctx: RunContext): Promise<string> {
    if (ctx.useFixtures) return readFixture(req.source, req.kind);

    let res: Response;
    let text: string;
    try {
        res = await fetch(req.url, { signal: AbortSignal.timeout(ctx.httpTimeoutMs) });
        text = await res.text();
    } catch (e) {
        const err = e as Error & { cause?: { code?: string } };
        if (err.name === 'TimeoutError') {
            throw new SourceError('TIMEOUT', `${ctx.httpTimeoutMs}ms 초과`);
        }
        throw new SourceError('HTTP_ERROR', redact(`${err.message}${err.cause?.code ? ` (${err.cause.code})` : ''}`));
    }

    if (res.status === 401 || res.status === 403) throw new SourceError('AUTH_ERROR', `HTTP ${res.status}`);
    if (!res.ok) throw new SourceError('HTTP_ERROR', `HTTP ${res.status}`);
    if (text.trim() === '') throw new SourceError('EMPTY_RESPONSE', '빈 본문');
    return text;
}

export async function fetchJson(req: HttpRequest, ctx: RunContext): Promise<unknown> {
    const text = await fetchText(req, ctx);
    try {
        return JSON.parse(text);
    } catch {
        // 공공데이터포털 계열은 JSON을 요청해도 오류를 XML로 줄 수 있음
        throw new SourceError('PARSE_ERROR', `JSON 아님: ${redact(text.replace(/\s+/g, ' ').slice(0, 120))}`);
    }
}

/** JSON 본문 POST 후 응답 JSON 반환. 실패 시 응답 본문 앞부분을 detail에 넣어 SourceError로 던짐 */
export async function postJson(req: PostRequest, ctx: RunContext): Promise<unknown> {
    if (ctx.useFixtures) return JSON.parse(await readFixture(req.source, req.kind));

    let res: Response;
    let text: string;
    try {
        res = await fetch(req.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...req.headers },
            body: JSON.stringify(req.body),
            signal: AbortSignal.timeout(req.timeoutMs),
        });
        text = await res.text();
    } catch (e) {
        const err = e as Error & { cause?: { code?: string } };
        if (err.name === 'TimeoutError') throw new SourceError('TIMEOUT', `${req.timeoutMs}ms 초과`);
        throw new SourceError('HTTP_ERROR', redact(`${err.message}${err.cause?.code ? ` (${err.cause.code})` : ''}`));
    }

    // 429, 400 에러 등은 원인이 본문에만 있어 앞부분을 남김
    const snippet = redact(text.replace(/\s+/g, ' ').slice(0, 160));
    if (res.status === 401 || res.status === 403) throw new SourceError('AUTH_ERROR', `HTTP ${res.status} ${snippet}`);
    if (!res.ok) throw new SourceError('HTTP_ERROR', `HTTP ${res.status} ${snippet}`);
    try {
        return JSON.parse(text);
    } catch {
        throw new SourceError('PARSE_ERROR', `JSON 아님: ${snippet}`);
    }
}

async function readFixture(source: FixtureDir, kind: string): Promise<string> {
    for (const ext of ['json', 'xml']) {
        try {
            return await readFile(path.join(process.cwd(), 'fixtures', source, `${kind}.${ext}`), 'utf8');
        } catch {
            // 파일이 없으면 다음 확장자 시도
        }
    }
    throw new SourceError('API_ERROR', `fixture 없음: ${source}/${kind}`);
}
