import { describe, expect, it } from 'vitest';
import { createClock, kstAt, kstDate, kstIso, kstTime, kstWeekday, waitUntil } from '../../src/core/clock.js';

// 2026-10-12T15:30:00Z = 2026-10-13 00:30 KST (화)
const AFTER_MIDNIGHT_KST = new Date('2026-10-12T15:30:00Z');

describe('KST 날짜 계산', () => {
    it('UTC로는 전날이어도 KST 날짜를 쓴다', () => {
        expect(kstDate(AFTER_MIDNIGHT_KST)).toBe('2026-10-13');
        expect(kstDate(AFTER_MIDNIGHT_KST, -1)).toBe('2026-10-12');
        expect(kstTime(AFTER_MIDNIGHT_KST)).toBe('00:30:00');
        expect(kstWeekday(AFTER_MIDNIGHT_KST)).toBe('화');
        expect(kstIso(AFTER_MIDNIGHT_KST)).toBe('2026-10-13T00:30:00+09:00');
    });

    it('kstAt은 같은 KST 날짜의 지정 시각을 만든다', () => {
        expect(kstAt(AFTER_MIDNIGHT_KST, '17:00').toISOString()).toBe('2026-10-13T08:00:00.000Z');
    });
});

describe('createClock', () => {
    it('--now 시각에서 출발한다', () => {
        const clock = createClock('2026-10-13T16:30:00+09:00');
        expect(kstIso(clock()).startsWith('2026-10-13T16:30')).toBe(true);
    });

    it('잘못된 --now 값은 오류', () => {
        expect(() => createClock('어제')).toThrow('--now');
    });
});

describe('waitUntil', () => {
    const clock = () => new Date('2026-10-13T16:59:00+09:00');

    it('목표 시각까지 남은 시간만큼 기다린다', async () => {
        const waited: number[] = [];
        await waitUntil(new Date('2026-10-13T17:00:00+09:00'), clock, async (ms) => {
            waited.push(ms);
        });
        expect(waited).toEqual([60_000]);
    });

    it('이미 지난 시각이면 기다리지 않는다', async () => {
        const waited: number[] = [];
        await waitUntil(new Date('2026-10-13T16:00:00+09:00'), clock, async (ms) => {
            waited.push(ms);
        });
        expect(waited).toEqual([]);
    });
});
