import type { Env, EnvKey, LlmModel } from './core/types.js';

export const ENV_KEYS: readonly EnvKey[] = [
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
    'HOLIDAY_API_URL',
];

export const SEND_AT = '17:00';
export const SUMMARY_DEADLINE = '16:55';
export const LLM_RETRY = 2;
export const HTTP_TIMEOUT_MS = 10_000;
// 무료 모델은 대기열·출력 길이에 따라 응답 시간이 들쭉날쭉해 소스 API보다 길게 둠
export const LLM_TIMEOUT_MS = 30_000;

/**  OpenRouter 모델 : main - ernie-5.5-flash, sub - ling-3.2-flash
    ernie는 preview 모델이라 종료일이 생길 수 있음 */
export const LLM_MODEL = 'baidu/ernie-5.5-flash-preview:free';
export const LLM_FALLBACK_MODEL = 'inclusionai/ling-3.2-flash:free';

// 모델별 요청 옵션. 여기 없는 모델은 JSON 모드·사고 모드 옵션을 보내지 않음
const MODEL_OPTIONS: Record<string, Omit<LlmModel, 'id'>> = {
    // 사고 모드 필수 모델 (끄기를 보내면 400)
    'baidu/ernie-5.5-flash-preview:free': { jsonMode: true, reasoningOff: false },
    'inclusionai/ling-3.2-flash:free': { jsonMode: true, reasoningOff: true },
};

function toModel(id: string): LlmModel {
    return { id, ...(MODEL_OPTIONS[id] ?? { jsonMode: false, reasoningOff: false }) };
}

/** 주·대체 모델 반환. 환경변수 LLM_MODEL·LLM_FALLBACK_MODEL이 있으면 상수보다 우선*/
export function resolveModels(source: NodeJS.ProcessEnv): { primary: LlmModel; fallback: LlmModel } {
    return {
        primary: toModel(source.LLM_MODEL?.trim() || LLM_MODEL),
        fallback: toModel(source.LLM_FALLBACK_MODEL?.trim() || LLM_FALLBACK_MODEL),
    };
}

export interface LoadedEnv {
    env: Env;
    missing: EnvKey[];
}

/** 키를 앞뒤 공백 없이 읽고, 빈 값인 키를 missing에 모음. 테스트용 임시 값은 누락으로 보지 않음 */
export function loadEnv(source: NodeJS.ProcessEnv): LoadedEnv {
    const env = {} as Record<EnvKey, string>;
    const missing: EnvKey[] = [];
    for (const key of ENV_KEYS) {
        const value = source[key]?.trim() ?? '';
        env[key] = value;
        if (value === '') missing.push(key);
    }
    return { env, missing };
}
