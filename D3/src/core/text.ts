/** 비교용 제목 키. 공백·특수문자를 지우고 소문자로 바꿈 (중복 제거·KMDb 매칭 공용) */
export function normalizeTitle(title: string): string {
    return title.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
