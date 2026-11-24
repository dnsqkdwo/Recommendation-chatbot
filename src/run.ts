// 전체 흐름. 조립은 여기서만 함. 반환값은 종료 코드

import type { CliOptions } from './cli.js';
import {
    HTTP_TIMEOUT_MS,
    LLM_RETRY,
    LLM_TIMEOUT_MS,
    resolveModels,
    SEND_AT,
    SUMMARY_DEADLINE,
    type LoadedEnv,
} from './config.js';
import { isBusinessDay } from './core/businessDay.js';
import { createClock, kstAt, kstDate, waitUntil } from './core/clock.js';
import { createAppError } from './core/errors.js';
import { initRedact, redact } from './core/redact.js';
import { CATEGORY_LABEL, type RunContext } from './core/types.js';
import { postWebhook } from './deliver/mattermost.js';
import { formatAdminMessage, type CandidateCount } from './notify/adminMessage.js';
import { ErrorCollector } from './notify/collector.js';
import { collect } from './pipeline/collect.js';
import { fetchDetails } from './pipeline/detail.js';
import { formatSelectDebug, LOW_CANDIDATE_COUNT, selectCategories } from './pipeline/select.js';
import { providers } from './providers/index.js';
import { renderMessage } from './render/markdown.js';
import { summarizeAll, type ChatCall } from './summarize/summarize.js';

const log = (message: string) => console.log(redact(message));
const DEBUG_DESCRIPTION_CHARS = 150;

/** 테스트에서 시간·LLM을 바꿔 끼우는 용도. 운영에서는 넘기지 않음 */
export interface RunDeps {
    sleep?: (ms: number) => Promise<void>;
    chat?: ChatCall;
}

export async function run(opts: CliOptions, loaded: LoadedEnv, deps: RunDeps = {}): Promise<number> {
    const { env, missing } = loaded;
    initRedact(Object.values(env));

    const now = createClock(opts.now);
    const ctx: RunContext = { now, useFixtures: opts.useFixtures, httpTimeoutMs: HTTP_TIMEOUT_MS, env };
    const collector = new ErrorCollector();
    const today = kstDate(now());
    let candidates: CandidateCount[] = [];

    /** 관리자 통지. 오류나 후보 부족이 있을 때만 보냄. dry-run이면 콘솔, 관리자 Webhook이 비어 있으면 stderr */
    const notifyAdmin = async (sentCategories: number, force = false) => {
        const errors = collector.list();
        if (!force && errors.length === 0 && !candidates.some((c) => c.low)) return;
        const text = formatAdminMessage(today, sentCategories, errors, candidates);
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
            if (!(await isBusinessDay(today, ctx))) {
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
    const selections = selectCategories(items, today);
    if (opts.debugSelect) log(formatSelectDebug(selections, today));
    candidates = selections.map((s) => ({ category: s.category, total: s.total, low: s.total < LOW_CANDIDATE_COUNT }));
    const emptyCategories = new Set(selections.filter((s) => s.picks.length === 0).map((s) => s.category));
    for (const provider of providers) {
        if (emptyCategories.has(provider.category) && !collector.list().some((e) => e.source === provider.name)) {
            collector.add(createAppError(provider.name, 'NO_CANDIDATE', now()));
        }
    }
    // 5. 상세 조회. 설명문이 없으면 요약 없이 보냄
    const details = await fetchDetails(selections, providers, ctx);
    for (const error of details.errors) collector.add(error);
    for (const d of details.picks) {
        const facts = d.facts.map((f) => f.label).join('·');
        log(
            `[상세] ${CATEGORY_LABEL[d.category]} ${d.item.title}: ` +
                (d.description ? `설명문 ${d.description.length}자 (${d.descriptionSource})` : '요약 없음') +
                (facts ? ` · ${facts}` : ''),
        );
        if (opts.debugSelect) {
            if (d.description) log(`  소개글: ${d.description.replace(/\s+/g, ' ').slice(0, DEBUG_DESCRIPTION_CHARS)}…`);
            for (const f of d.facts) log(`  ${f.label}: ${f.value}`);
        }
    }

    // 6. 요약. 설명문이 있는 분야만 LLM 호출, 실패·마감 초과 분야는 제외
    const { primary, fallback } = resolveModels(process.env);
    const summary = await summarizeAll(
        details.picks.flatMap((d) => (d.description ? [{ category: d.category, description: d.description }] : [])),
        {
            // 깨진 출력은 대부분 일시적이라 주 모델로 한 번 더 시도한 뒤 대체 모델
            models: [primary, primary, fallback].slice(0, LLM_RETRY + 1),
            timeoutMs: LLM_TIMEOUT_MS,
            ...(deps.chat ? { call: deps.chat } : {}),
            deadline: kstAt(now(), SUMMARY_DEADLINE),
        },
        ctx,
    );
    for (const error of summary.errors) collector.add(error);
    const sendable = details.picks.filter((d) => !d.description || summary.summaries[d.category]);
    for (const d of sendable) {
        const text = summary.summaries[d.category];
        if (text) log(`[요약] ${CATEGORY_LABEL[d.category]} ${text.length}자: ${text}`);
    }
    const selected = sendable.map((d) => ({ item: d.item, facts: d.facts, summary: summary.summaries[d.category] }));

    // 7. 렌더. 남은 분야가 없으면 발송하지 않고 관리자에게만 알림
    if (selected.length === 0) {
        log('발송할 분야 없음');
        await notifyAdmin(0, true);
        return 0;
    }
    const message = renderMessage(now(), selected);

    // 8. 17:00 대기
    if (!opts.noWait) {
        log(`${SEND_AT}까지 대기`);
        await waitUntil(kstAt(now(), SEND_AT), now, deps.sleep);
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
