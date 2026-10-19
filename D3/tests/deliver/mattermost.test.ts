import { afterEach, describe, expect, it, vi } from 'vitest';
import { initRedact } from '../../src/core/redact.js';
import { postWebhook } from '../../src/deliver/mattermost.js';

const HOOK = 'https://chat.example.com/hooks/abc';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('postWebhook', () => {
    it('성공하면 true', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));
        expect(await postWebhook(HOOK, 'hi', '사용자')).toBe(true);
    });

    it('실패하면 false이고 stderr에 응답 코드를 출력한다. URL은 남기지 않는다', async () => {
        initRedact([HOOK]);
        vi.stubGlobal('fetch', vi.fn(async () => new Response(`bad ${HOOK}`, { status: 500 })));
        const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await postWebhook(HOOK, 'hi', '관리자')).toBe(false);
        const out = String(stderr.mock.calls[0]?.[0]);
        expect(out).toContain('관리자 메시지 전송 실패: HTTP 500');
        expect(out).not.toContain('hooks/abc');
    });

    it('네트워크 오류도 stderr에 출력한다', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
        const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await postWebhook(HOOK, 'hi', '사용자')).toBe(false);
        expect(String(stderr.mock.calls[0]?.[0])).toContain('사용자 메시지 전송 실패');
    });
});
