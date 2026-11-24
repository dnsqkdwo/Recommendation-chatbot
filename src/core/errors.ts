import { kstIso } from './clock.js';
import { redact } from './redact.js';
import type { SourceName } from './types.js';

export type ErrorCode =
    | 'ENV_MISSING'
    | 'HOLIDAY_CHECK_FAILED'
    | 'HTTP_ERROR'
    | 'TIMEOUT'
    | 'AUTH_ERROR'
    | 'API_ERROR'
    | 'PARSE_ERROR'
    | 'EMPTY_RESPONSE'
    | 'NO_CANDIDATE'
    | 'DETAIL_FAILED'
    | 'LLM_ERROR'
    | 'LLM_INVALID_OUTPUT'
    | 'DEADLINE_EXCEEDED'
    | 'DELIVER_FAILED';

export type ErrorSource = SourceName | 'llm' | 'system' | 'deliver';

export interface AppError {
    source: ErrorSource;
    code: ErrorCode;
    detail?: string;
    at: string;
}

/** provider·http에서 던지는 에러. run.ts가 받아 AppError로 바꿔 기록 */
export class SourceError extends Error {
    constructor(
        readonly code: ErrorCode,
        detail: string,
    ) {
        super(detail);
        this.name = 'SourceError';
    }
}

export function createAppError(source: ErrorSource, code: ErrorCode, now: Date, detail?: string): AppError {
    return {
        source,
        code,
        ...(detail ? { detail: redact(detail) } : {}),
        at: kstIso(now),
    };
}

interface DataGoKrServiceError {
    OpenAPI_ServiceResponse?: { cmmMsgHeader?: { errMsg?: string; returnReasonCode?: string } };
}

const DATA_GO_KR_KEY_ERRORS = new Set(['30', '31']);

/** 공공데이터포털 게이트웨이 오류 검사. */
export function throwIfDataGoKrError(parsed: unknown): void {
    const header = (parsed as DataGoKrServiceError | null)?.OpenAPI_ServiceResponse?.cmmMsgHeader;
    if (!header) return;
    const code = header.returnReasonCode ?? '';
    throw new SourceError(DATA_GO_KR_KEY_ERRORS.has(code) ? 'AUTH_ERROR' : 'API_ERROR', `${code} ${header.errMsg ?? ''}`.trim());
}

/** 잡은 예외를 AppError로 변환. SourceError가 아니면 API_ERROR로 분류 */
export function toAppError(source: ErrorSource, err: unknown, now: Date): AppError {
    if (err instanceof SourceError) return createAppError(source, err.code, now, err.message);
    return createAppError(source, 'API_ERROR', now, err instanceof Error ? err.message : String(err));
}
