import { describe, expect, it } from 'vitest';
import { countSentences, findBrokenText, parseSummary } from '../../src/summarize/validate.js';

const THREE = '첫 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다.';
const SRC = '원문입니다.';

describe('countSentences', () => {
    it('문장 끝 부호 뒤가 공백이거나 끝일 때만 셈', () => {
        expect(countSentences(THREE)).toBe(3);
        expect(countSentences('평점 4.5점입니다. 좋습니다!')).toBe(2);
    });

    it('닫는 따옴표 뒤의 문장 끝도 셈', () => {
        expect(countSentences('그는 “함께 가요.” 라고 말합니다. 끝입니다.')).toBe(3);
    });
});

describe('findBrokenText', () => {
    it('원문에 없는 영문 3글자 이상·한자·밑줄은 깨진 출력', () => {
        expect(findBrokenText('쓸atitude한 삶입니다. 끝입니다.', SRC)).toBe('원문에 없는 문자열: atitude');
        expect(findBrokenText('이웃과 共同체를 생각합니다. 끝입니다.', SRC)).toBe('원문에 없는 문자열: 共同');
        expect(findBrokenText('다시 되_sal고자 합니다. 끝입니다.', SRC)).toBe('원문에 없는 문자열: _');
    });

    it('원문에 있는 영문은 대소문자 무관하게 통과, 2글자 이하는 검사 안 함', () => {
        expect(findBrokenText('WICKED 야시장이 열립니다. IT 기업이 참여합니다.', '백년나이트 야시장 「wicked」')).toBeNull();
    });

    it('반말 문장이 하나라도 있으면 실패', () => {
        expect(findBrokenText('이야기를 그린다. 따뜻하게 묘사합니다.', SRC)).toBe('존댓말 아님: 이야기를 그린다.');
        expect(findBrokenText('함께 가세요. 좋은 책입니다. 추천해요!', SRC)).toBeNull();
        expect(findBrokenText('『책』입니다. 그는 “좋습니다.”', SRC)).toBeNull();
    });

    it('소수점은 문장 끝으로 보지 않음', () => {
        expect(findBrokenText('관객 수가 전작의 1.5배에 이릅니다. 가족 이야기를 담았습니다.', SRC)).toBeNull();
        expect(findBrokenText('평점 4.5점이다. 좋습니다.', SRC)).toBe('존댓말 아님: 평점 4.5점이다.');
    });
});

describe('parseSummary', () => {
    it('JSON 객체에서 summary를 꺼냄', () => {
        expect(parseSummary(JSON.stringify({ summary: ` ${THREE} ` }), SRC)).toEqual({ ok: true, summary: THREE });
    });

    it('코드블록 펜스와 앞뒤 설명을 벗기고 파싱', () => {
        const raw = `요약입니다.\n\`\`\`json\n{"summary": "${THREE}"}\n\`\`\``;
        expect(parseSummary(raw, SRC)).toEqual({ ok: true, summary: THREE });
    });

    it('빈 응답·JSON 아님·summary 없음은 실패', () => {
        expect(parseSummary(null, SRC)).toEqual({ ok: false, reason: '빈 응답' });
        expect(parseSummary('그냥 문장입니다.', SRC)).toEqual({ ok: false, reason: 'JSON 파싱 실패' });
        expect(parseSummary('{"text": "x"}', SRC)).toEqual({ ok: false, reason: 'summary 없음' });
        expect(parseSummary('{"summary": "  "}', SRC)).toEqual({ ok: false, reason: 'summary 없음' });
    });

    it('문장 수 2~5만 허용', () => {
        expect(parseSummary('{"summary": "한 문장입니다."}', SRC)).toMatchObject({ ok: false, reason: '1문장 (2~5 허용)' });
        const six = '문장입니다. '.repeat(6).trim();
        expect(parseSummary(JSON.stringify({ summary: six }), SRC)).toMatchObject({ ok: false, reason: '6문장 (2~5 허용)' });
    });

    it('400자 초과는 실패', () => {
        const long = `${'가'.repeat(399)}. 끝입니다.`;
        expect(parseSummary(JSON.stringify({ summary: long }), SRC)).toMatchObject({ ok: false });
    });

    it('깨진 출력은 실패', () => {
        const raw = JSON.stringify({ summary: '공동체의 COMMONTY를 생각합니다. 끝입니다.' });
        expect(parseSummary(raw, SRC)).toEqual({ ok: false, reason: '원문에 없는 문자열: COMMONTY' });
    });
});
