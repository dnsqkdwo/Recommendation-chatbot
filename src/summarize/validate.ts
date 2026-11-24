export const SUMMARY_MIN_SENTENCES = 2;
export const SUMMARY_MAX_SENTENCES = 5;
export const SUMMARY_MAX_LENGTH = 400;

export type SummaryCheck = { ok: true; summary: string } | { ok: false; reason: string };

const CLOSERS = `"'”’)\\]」』`;
// countSentences와 같은 기준으로 나눔. 1.5처럼 부호 뒤가 공백이 아니면 문장 끝이 아님
const SENTENCE = new RegExp(`[\\s\\S]+?(?:[.!?]+[${CLOSERS}]*(?=\\s|$)|$)`, 'g');
const POLITE_END = new RegExp(`(니다|요)[.!?]*[${CLOSERS}]*$`);

/** 코드블록 펜스를 벗기고, 앞뒤에 다른 글이 붙어 있으면 첫 { ~ 마지막 } 구간만 남김 */
function extractJson(raw: string): string {
    const text = raw
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

/** 마침표·물음표·느낌표 뒤가 공백이거나 끝이면 문장 하나로 셈. 닫는 따옴표·괄호는 건너뜀, 1.5 같은 숫자는 제외 */
export function countSentences(text: string): number {
    return (text.match(/[.!?](?=["'”’)\]」』]*(?:\s|$))/g) ?? []).length;
}

/**
 * 모델 출력이 깨졌는지 검사. 원문에 없는 영문 단어·한자·밑줄이 끼었거나 반말 문장이 있으면 사유 반환.
 * 원문에 있는 영문은 통과
 */
export function findBrokenText(summary: string, original: string): string | null {
    const source = original.toLowerCase();
    const foreign = summary.match(/[A-Za-z]{3,}|[㐀-鿿豈-﫿]+|_/g) ?? [];
    const unknown = foreign.find((token) => !source.includes(token.toLowerCase()));
    if (unknown) return `원문에 없는 문자열: ${unknown}`;

    const plain = (summary.match(SENTENCE) ?? []).map((s) => s.trim()).find((s) => s && !POLITE_END.test(s));
    if (plain) return `존댓말 아님: ${plain.slice(-20)}`;
    return null;
}

/** LLM 응답 원문을 {"summary"}로 파싱하고 문장 수·길이·깨짐을 검사. 실패 시 사유 반환 */
export function parseSummary(raw: string | null, original: string): SummaryCheck {
    if (!raw || raw.trim() === '') return { ok: false, reason: '빈 응답' };

    let parsed: unknown;
    try {
        parsed = JSON.parse(extractJson(raw));
    } catch {
        return { ok: false, reason: 'JSON 파싱 실패' };
    }

    const summary = (parsed as { summary?: unknown } | null)?.summary;
    if (typeof summary !== 'string' || summary.trim() === '') return { ok: false, reason: 'summary 없음' };

    const text = summary.trim();
    if (text.length > SUMMARY_MAX_LENGTH) return { ok: false, reason: `${text.length}자 (최대 ${SUMMARY_MAX_LENGTH})` };
    const sentences = countSentences(text);
    if (sentences < SUMMARY_MIN_SENTENCES || sentences > SUMMARY_MAX_SENTENCES) {
        return { ok: false, reason: `${sentences}문장 (${SUMMARY_MIN_SENTENCES}~${SUMMARY_MAX_SENTENCES} 허용)` };
    }
    const broken = findBrokenText(text, original);
    if (broken) return { ok: false, reason: broken };
    return { ok: true, summary: text };
}
