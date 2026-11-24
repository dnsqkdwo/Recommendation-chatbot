import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToText, normalizeTitle } from '../../src/core/text.js';

describe('normalizeTitle', () => {
    it('공백·특수문자 제거, 소문자', () => {
        expect(normalizeTitle(' 극장판 치이카와: 인어 섬의 비밀 ')).toBe('극장판치이카와인어섬의비밀');
        expect(normalizeTitle('LIVE in SETi vol.96')).toBe('liveinsetivol96');
    });
});

describe('decodeEntities', () => {
    it('이름·숫자 엔티티를 풂', () => {
        expect(decodeEntities('&lt;연희판판&gt; &#39;한지&#39; 1,5&deg;C AI&middot;SW &#x41;')).toBe("<연희판판> '한지' 1,5°C AI·SW A");
    });

    it('한 단계만 풀고 모르는 이름은 그대로 둠', () => {
        expect(decodeEntities('&amp;lt; &unknown; A&B')).toBe('&lt; &unknown; A&B');
    });
});

describe('htmlToText', () => {
    it('태그를 지우고 엔티티·공백 정리, 문단은 줄바꿈', () => {
        const html = '<p style=&#034;line-height: 160%;&#034;><span>주인공 &lsquo;공정한&rsquo;이&nbsp;</span></p><br>\n<br>\n<p>&lt;체험하기&gt; 끝</p>';
        expect(htmlToText(html)).toBe('주인공 ‘공정한’이\n<체험하기> 끝');
    });
});
