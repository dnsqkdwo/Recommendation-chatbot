import type { Env, EnvKey } from './core/types.js';

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
];

export const SEND_AT = '17:00'; // KST
export const SUMMARY_DEADLINE = '16:55'; // KST
export const LLM_RETRY = 1;
export const HTTP_TIMEOUT_MS = 10_000;

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
