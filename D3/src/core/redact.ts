// 로그·통지 등 외부로 나가는 문자열의 키·Webhook URL을 ***로 가림

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
    // 긴 값부터 치환. 짧은 값이 먼저 바뀌면 긴 값의 나머지 부분이 노출될 수 있음
    secrets = [...set].sort((a, b) => b.length - a.length);
}

// 로그에 유출되면 안되는 사항을 모두 가림
export function redact(text: string): string {
    let out = text;
    for (const secret of secrets) {
        out = out.split(secret).join(MASK);
    }
    return out;
}
