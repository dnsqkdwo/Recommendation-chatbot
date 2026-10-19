import { beforeEach, describe, expect, it } from 'vitest';
import { initRedact, redact } from '../../src/core/redact.js';

describe('redact', () => {
    beforeEach(() => {
        initRedact(['abc+/=key', 'https://chat.example.com/hooks/xyz', undefined, '']);
    });

    it('원래 값을 마스킹한다', () => {
        expect(redact('key=abc+/=key end')).toBe('key=*** end');
    });

    it('URL 인코딩된 값을 마스킹한다', () => {
        expect(redact('serviceKey=abc%2B%2F%3Dkey&x=1')).toBe('serviceKey=***&x=1');
    });

    it('Webhook URL을 마스킹한다', () => {
        expect(redact('POST https://chat.example.com/hooks/xyz 500')).toBe('POST *** 500');
    });

    it('빈 값은 등록하지 않는다', () => {
        expect(redact('plain text')).toBe('plain text');
    });
});
