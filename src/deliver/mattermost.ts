import { redact } from '../core/redact.js';

const TIMEOUT_MS = 10_000;

/** Webhook으로 text 발송. 성공 시 true, 실패 시 stderr에 출력하고 false (label: 로그의 사용자/관리자 구분) */
export async function postWebhook(url: string, text: string, label: string): Promise<boolean> {
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.ok) return true;
        const body = await res.text().catch(() => '');
        console.error(redact(`[mattermost] ${label} 메시지 전송 실패: HTTP ${res.status} ${body.slice(0, 200)}`));
        return false;
    } catch (e) {
        const err = e as Error & { cause?: { code?: string } };
        console.error(
            redact(`[mattermost] ${label} 메시지 전송 실패: ${err.name} ${err.message}${err.cause?.code ? ` (${err.cause.code})` : ''}`),
        );
        return false;
    }
}
