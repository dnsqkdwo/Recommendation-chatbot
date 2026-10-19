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
    detail?: string; // redact() 적용 후 저장
    at: string; // ISO, KST
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

/** 잡은 예외를 AppError로 변환. SourceError가 아니면 API_ERROR로 분류 */
export function toAppError(source: ErrorSource, err: unknown, now: Date): AppError {
    if (err instanceof SourceError) return createAppError(source, err.code, now, err.message);
    return createAppError(source, 'API_ERROR', now, err instanceof Error ? err.message : String(err));
}
