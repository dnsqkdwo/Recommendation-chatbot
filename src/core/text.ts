/** 비교용 제목 키. 공백·특수문자를 지우고 소문자로 바꿈 */
export function normalizeTitle(title: string): string {
    return title.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

const NAMED_ENTITIES: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    middot: '·',
    deg: '°',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
    rarr: '→',
};

/** HTML 엔티티를 한 단계만 풂. 모르는 이름은 그대로 둠 */
export function decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
        if (name[0] === '#') {
            const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
            return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
        }
        return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
    });
}

/** HTML 조각을 평문으로 바꿈. 태그를 지운 뒤 엔티티를 풀고 공백을 정리함 */
export function htmlToText(html: string): string {
    const text = html
        .replace(/<br\s*\/?>|<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, '');
    return decodeEntities(text)
        .replace(/[ \t\u00a0]+/g, ' ')
        .replace(/ *\n[\s]*/g, '\n')
        .trim();
}
