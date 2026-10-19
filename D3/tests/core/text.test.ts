import { describe, expect, it } from 'vitest';
import { normalizeTitle } from '../../src/core/text.js';

describe('normalizeTitle', () => {
    it('공백·특수문자 제거, 소문자', () => {
        expect(normalizeTitle(' 극장판 치이카와: 인어 섬의 비밀 ')).toBe('극장판치이카와인어섬의비밀');
        expect(normalizeTitle('LIVE in SETi vol.96')).toBe('liveinsetivol96');
    });
});
