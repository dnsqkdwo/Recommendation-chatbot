import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
});

export function parseXml(text: string): unknown {
    return parser.parse(text);
}

/** 값을 항상 배열로 반환. XML은 결과가 1건이면 객체로 오므로 목록 필드는 이걸로 감쌈 */
export function asArray<T>(value: T | T[] | undefined | null | ''): T[] {
    if (value === undefined || value === null || value === '') return [];
    return Array.isArray(value) ? value : [value];
}
