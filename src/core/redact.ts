const MASK = '***';
let secrets: string[] = [];

/** 기동 시 1회 호출. 원래 값과 URL 인코딩된 값을 함께 등록 */
export function initRedact(values: ReadonlyArray<string | undefined>): void {
    const set = new Set<string>();
    for (const raw of values) {
        const value = raw?.trim();
        if (!value) continue;
        set.add(value);
        set.add(encodeURIComponent(value));
        set.add(new URLSearchParams({ v: value }).toString().slice(2));
    }
    secrets = [...set].sort((a, b) => b.length - a.length);
}

// 로그에 유출되면 안되는 사항을 모두 가림 처리
export function redact(text: string): string {
    let out = text;
    for (const secret of secrets) {
        out = out.split(secret).join(MASK);
    }
    return out;
}
