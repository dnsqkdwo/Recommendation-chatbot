import { SourceError } from '../core/errors.js';
import { postJson } from '../core/http.js';
import type { LlmModel, RunContext } from '../core/types.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
// 사고 모드를 끌 수 없는 모델이 추론에 1000토큰 넘게 써서 빈 응답이 나오는 것 방지. 요약 길이는 검증에서 따로 제한
const MAX_TOKENS = 3000;

export interface ChatMessage {
    role: 'system' | 'user';
    content: string;
}

export interface ChatResult {
    content: string | null; // 사고 모드가 토큰을 다 쓰면 null로 옴 -> 실행 X
    reasoningTokens: number;
    provider?: string;
}

interface CompletionResponse {
    error?: { message?: string };
    provider?: string;
    choices?: { message?: { content?: string | null } }[];
    usage?: { completion_tokens_details?: { reasoning_tokens?: number } };
}

/** chat/completions 1회 호출. HTTP 오류·본문 error는 SourceError로 던짐 */
export async function chatCompletion(
    model: LlmModel,
    messages: ChatMessage[],
    ctx: RunContext,
    timeoutMs: number,
): Promise<ChatResult> {
    const json = (await postJson(
        {
            source: 'llm',
            kind: 'summary',
            url: ENDPOINT,
            headers: { Authorization: `Bearer ${ctx.env.OPENROUTER_API_KEY}` },
            body: {
                model: model.id,
                messages,
                max_tokens: MAX_TOKENS,
                ...(model.jsonMode ? { response_format: { type: 'json_object' } } : {}),
                ...(model.reasoningOff ? { reasoning: { enabled: false } } : {}),
            },
            timeoutMs,
        },
        ctx,
    )) as CompletionResponse;

    if (json.error) throw new SourceError('LLM_ERROR', json.error.message ?? '응답에 error 있음');
    return {
        content: json.choices?.[0]?.message?.content ?? null,
        reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
        ...(json.provider ? { provider: json.provider } : {}),
    };
}
