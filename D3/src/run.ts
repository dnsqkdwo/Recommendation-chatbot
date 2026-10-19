// 전체 흐름. 조립은 여기서만 함. 반환값은 종료 코드

import type { CliOptions } from './cli.js';
import { HTTP_TIMEOUT_MS, SEND_AT, type LoadedEnv } from './config.js';
import { isBusinessDay } from './core/businessDay.js';
import { createClock, kstAt, kstDate, waitUntil } from './core/clock.js';
import { createAppError } from './core/errors.js';
import { initRedact, redact } from './core/redact.js';
import type { RunContext } from './core/types.js';
import { postWebhook } from './deliver/mattermost.js';
import { formatAdminMessage } from './notify/adminMessage.js';
import { ErrorCollector } from './notify/collector.js';
import { collect } from './pipeline/collect.js';
import { CATEGORY_ORDER, selectPicks } from './pipeline/select.js';
import { providers } from './providers/index.js';
import { renderMessage } from './render/markdown.js';

const log = (message: string) => console.log(redact(message));

export async function run(opts: CliOptions, loaded: LoadedEnv): Promise<number> {
    const { env, missing } = loaded;
    initRedact(Object.values(env));

    const now = createClock(opts.now);
    const ctx: RunContext = { now, useFixtures: opts.useFixtures, httpTimeoutMs: HTTP_TIMEOUT_MS, env };
    const collector = new ErrorCollector();
    const today = kstDate(now());

    /** 관리자 통지. dry-run이면 콘솔, 관리자 Webhook이 비어 있으면 stderr */
    const notifyAdmin = async (sentCategories: number) => {
        const errors = collector.list();
        if (errors.length === 0) return;
        const text = formatAdminMessage(today, sentCategories, errors);
        if (opts.dryRun) {
            log(`--- 관리자 메시지 (dry-run) ---\n${text}`);
        } else if (env.MATTERMOST_ADMIN_WEBHOOK_URL) {
            await postWebhook(env.MATTERMOST_ADMIN_WEBHOOK_URL, text, '관리자');
        } else {
            console.error(redact(text));
        }
    };

    // 1. 환경변수
    if (missing.length > 0) {
        collector.add(createAppError('system', 'ENV_MISSING', now(), missing.join(', ')));
        await notifyAdmin(0);
        return 1;
    }

    // 2. 영업일
    if (!opts.skipHoliday) {
        try {
            if (!(await isBusinessDay(today))) {
                log(`${today} 휴일. 발송하지 않고 종료`);
                return 0;
            }
        } catch (e) {
            // 판정 실패 시 평일로 간주하고 진행
            collector.add(
                createAppError('system', 'HOLIDAY_CHECK_FAILED', now(), e instanceof Error ? e.message : String(e)),
            );
        }
    }

    // 3. 수집
    const { items, counts, errors } = await collect(providers, ctx);
    for (const { source, count } of counts) log(`[${source}] ${count}건`);
    for (const error of errors) collector.add(error);

    // 4. 선정. 등록된 provider가 있는 분야만 후보 0건을 기록
    const picks = selectPicks(items, today);
    for (const provider of providers) {
        if (!picks.has(provider.category) && !collector.list().some((e) => e.source === provider.name)) {
            collector.add(createAppError(provider.name, 'NO_CANDIDATE', now()));
        }
    }
    const selected = CATEGORY_ORDER.flatMap((c) => picks.get(c) ?? []);

    // 5~6. 상세 조회·요약은 아직임

    // 7. 렌더
    if (selected.length === 0) {
        log('발송할 분야 없음');
        await notifyAdmin(0);
        return 0;
    }
    const message = renderMessage(now(), selected);

    // 8. 17:00 대기
    if (!opts.noWait) {
        log(`${SEND_AT}까지 대기`);
        await waitUntil(kstAt(now(), SEND_AT), now);
    }

    // 9. 발송
    let exitCode = 0;
    if (opts.dryRun) {
        log(`--- 사용자 메시지 (dry-run) ---\n${message}`);
    } else {
        const ok = await postWebhook(env.MATTERMOST_WEBHOOK_URL, message, '사용자');
        if (ok) {
            log(`발송 완료: ${selected.length}개 분야`);
        } else {
            collector.add(createAppError('deliver', 'DELIVER_FAILED', now()));
            exitCode = 1;
        }
    }

    // 10. 관리자 통지
    await notifyAdmin(exitCode === 0 ? selected.length : 0);
    return exitCode;
}
