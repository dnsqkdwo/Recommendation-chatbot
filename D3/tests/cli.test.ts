import { describe, expect, it } from 'vitest';
import { parseCli } from '../src/cli.js';

describe('parseCli', () => {
    it('옵션 없으면 모두 false', () => {
        expect(parseCli([])).toEqual({ dryRun: false, noWait: false, skipHoliday: false, useFixtures: false });
    });

    it('5개 옵션을 읽는다', () => {
        expect(
            parseCli(['--dry-run', '--now=2026-10-13T16:30:00+09:00', '--no-wait', '--skip-holiday', '--use-fixtures']),
        ).toEqual({
            dryRun: true,
            now: '2026-10-13T16:30:00+09:00',
            noWait: true,
            skipHoliday: true,
            useFixtures: true,
        });
    });

    it('모르는 옵션은 오류', () => {
        expect(() => parseCli(['--dryrun'])).toThrow();
    });
});
