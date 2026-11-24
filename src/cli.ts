import { parseArgs } from 'node:util';

export interface CliOptions {
    dryRun: boolean;
    now?: string;
    noWait: boolean;
    skipHoliday: boolean;
    useFixtures: boolean;
    debugSelect: boolean; // 분야별 후보 상위 5개와 선정 결과를 콘솔에 출력
}

/** 실행 인자를 CliOptions로 변환. 모르는 옵션이나 값 형식이 틀리면 예외를 던짐 */
export function parseCli(argv: string[]): CliOptions {
    const { values } = parseArgs({
        args: argv,
        options: {
            'dry-run': { type: 'boolean', default: false },
            now: { type: 'string' },
            'no-wait': { type: 'boolean', default: false },
            'skip-holiday': { type: 'boolean', default: false },
            'use-fixtures': { type: 'boolean', default: false },
            'debug-select': { type: 'boolean', default: false },
        },

        strict: true,
        allowPositionals: false,
    });
    return {
        dryRun: values['dry-run'],
        // --now가 없으면 now 키 자체를 넣지 않음
        ...(values.now !== undefined ? { now: values.now } : {}),
        noWait: values['no-wait'],
        skipHoliday: values['skip-holiday'],
        useFixtures: values['use-fixtures'],
        debugSelect: values['debug-select'],
    };
}
