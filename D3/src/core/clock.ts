const KST_OFFSET_MS = 9 * 3600_000;
const DAY_MS = 86400_000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export type Clock = () => Date;

/** 현재 시각을 돌려주는 시계 생성. --now가 있으면 그 시각에서 출발해 실제 경과 시간만큼 흐름 */
export function createClock(nowArg?: string): Clock {
    if (!nowArg) return () => new Date();
    const start = new Date(nowArg);
    if (Number.isNaN(start.getTime())) {
        throw new Error(`--now 값을 해석할 수 없습니다: ${nowArg}`);
    }
    const realStart = Date.now();
    return () => new Date(start.getTime() + (Date.now() - realStart));
}

/** KST 기준 YYYY-MM-DD. offsetDays만큼 앞뒤 날짜로 이동 */
export function kstDate(date: Date, offsetDays = 0): string {
    return new Date(date.getTime() + KST_OFFSET_MS + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

export function kstTime(date: Date): string {
    return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(11, 19);
}

export function kstIso(date: Date): string {
    return `${kstDate(date)}T${kstTime(date)}+09:00`;
}

export function kstWeekday(date: Date): string {
    return WEEKDAYS[new Date(date.getTime() + KST_OFFSET_MS).getUTCDay()]!;
}

/** date와 같은 KST 날짜의 HH:MM 시각 반환 (예: 오늘 17:00) */
export function kstAt(date: Date, hhmm: string): Date {
    return new Date(`${kstDate(date)}T${hhmm}:00+09:00`);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** target 시각까지 대기. 이미 지났으면 바로 반환 */
export async function waitUntil(target: Date, clock: Clock, sleep = defaultSleep): Promise<void> {
    const ms = target.getTime() - clock().getTime();
    if (ms > 0) await sleep(ms);
}
