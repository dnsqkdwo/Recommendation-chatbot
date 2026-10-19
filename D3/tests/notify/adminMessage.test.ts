import { describe, expect, it } from 'vitest';
import { createAppError } from '../../src/core/errors.js';
import { initRedact } from '../../src/core/redact.js';
import { formatAdminMessage } from '../../src/notify/adminMessage.js';

const at = (hms: string) => new Date(`2026-10-13T${hms}+09:00`);

describe('formatAdminMessage', () => {
    it('첫 줄은 [관리자]로 시작하고 에러는 한 줄씩 나온다', () => {
        const text = formatAdminMessage('2026-10-13', 3, [
            createAppError('kopis', 'TIMEOUT', at('16:31:12')),
            createAppError('tourApi', 'AUTH_ERROR', at('16:31:05'), 'HTTP 401'),
        ]);
        expect(text).toBe(
            [
                '[관리자] 2026-10-13 실행 결과: 발송 3개 분야 / 실패 2건',
                '- [kopis] TIMEOUT 16:31:12',
                '- [tourApi] AUTH_ERROR 16:31:05 (키 오타·승인·만료 확인 필요)',
            ].join('\n'),
        );
    });

    it('ENV_MISSING은 비어 있는 키 이름만 보여준다', () => {
        const text = formatAdminMessage('2026-10-13', 0, [
            createAppError('system', 'ENV_MISSING', at('16:30:01'), 'KOBIS_API_KEY'),
        ]);
        expect(text.split('\n')[1]).toBe('- [system] ENV_MISSING 16:30:01 (KOBIS_API_KEY 비어 있음)');
    });

    it('detail에 섞인 키·URL은 마스킹된다', () => {
        initRedact(['secret-key-123', 'https://chat.example.com/hooks/abc']);
        const text = formatAdminMessage('2026-10-13', 1, [
            createAppError('kobis', 'API_ERROR', at('16:30:05'), 'key=secret-key-123 → https://chat.example.com/hooks/abc'),
        ]);
        expect(text).not.toContain('secret-key-123');
        expect(text).not.toContain('hooks/abc');
        expect(text).toContain('key=***');
    });
});
