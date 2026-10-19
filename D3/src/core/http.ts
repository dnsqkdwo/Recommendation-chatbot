// 모든 API 호출 담당. fixture 모드 분기는 이 파일에서만 처리

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SourceError } from './errors.js';
import { redact } from './redact.js';
import type { RunContext, SourceName } from './types.js';

export interface HttpRequest {
    source: SourceName;
    kind: string; // fixture 파일 이름 (list, detail ...)
    url: string;
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

async function readFixture(source: SourceName, kind: string): Promise<string> {
    for (const ext of ['json', 'xml']) {
        try {
            return await readFile(path.join(process.cwd(), 'fixtures', source, `${kind}.${ext}`), 'utf8');
        } catch {
            // 파일이 없으면 다음 확장자 시도
        }
    }
    throw new SourceError('API_ERROR', `fixture 없음: ${source}/${kind}`);
}
