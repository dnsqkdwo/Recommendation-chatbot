// 주·대체 LLM 모델을 같은 원문으로 비교 - 응답 시간, JSON 준수, 검증 통과, 요약문 출력
// 명령어: yarn tsx --env-file=.env scripts/compareModels.ts
// 원문은 fixtures의 분야별 소개글 4개. 키는 출력하지 않음 (오류 문구도 redact() 거침)

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv, HTTP_TIMEOUT_MS, resolveModels } from '../src/config.js';
import { createClock } from '../src/core/clock.js';
import { SourceError } from '../src/core/errors.js';
import { initRedact, redact } from '../src/core/redact.js';
import type { LlmModel, RunContext } from '../src/core/types.js';
import { parseBookDetail } from '../src/providers/data4library.js';
import { parseKmdbPlot } from '../src/providers/kmdb.js';
import { parseNlRecommend } from '../src/providers/nlRecommend.js';
import { parseTourDetail } from '../src/providers/tourApi.js';
import { chatCompletion } from '../src/summarize/openrouter.js';
import { buildSummaryMessages } from '../src/summarize/prompt.js';
import { parseSummary } from '../src/summarize/validate.js';

const RUNS = 3;
const TIMEOUT_MS = 60_000; // 비교용. 운영 호출 타임아웃은 summarize에서 정함
const GAP_MS = 4_000; // 무료 모델 분당 호출 한도 대비 간격

const { env } = loadEnv(process.env);
initRedact(Object.values(env));
const ctx: RunContext = { now: createClock(), useFixtures: false, httpTimeoutMs: HTTP_TIMEOUT_MS, env };

const fixture = (p: string) => readFile(path.join(process.cwd(), 'fixtures', p), 'utf8');

async function loadSamples(): Promise<{ name: string; text: string }[]> {
    const samples = [
        { name: '영화 KMDb', text: parseKmdbPlot(await fixture('kmdb/list.json'), '기생충', '2019') },
        { name: '행사 tourApi', text: parseTourDetail(await fixture('tourApi/detail.json')) },
        { name: '서적 사서추천', text: parseNlRecommend(await fixture('nlRecommend/list.xml'))[0]?.description ?? null },
        { name: '서적 정보나루', text: parseBookDetail(JSON.parse(await fixture('data4library/detail.json'))) },
    ];
    return samples.filter((s): s is { name: string; text: string } => !!s.text);
}

interface Trial {
    sample: string;
    ms: number;
    error?: string;
    jsonOk: boolean;
    valid: boolean;
    reason?: string;
    summary?: string;
    reasoningTokens: number;
}

async function runOnce(model: LlmModel, sample: { name: string; text: string }): Promise<Trial> {
    const started = Date.now();
    try {
        const res = await chatCompletion(model, buildSummaryMessages(sample.text), ctx, TIMEOUT_MS);
        const check = parseSummary(res.content, sample.text);
        const jsonOk = check.ok || !['빈 응답', 'JSON 파싱 실패'].includes(check.reason);
        return {
            sample: sample.name,
            ms: Date.now() - started,
            jsonOk,
            valid: check.ok,
            reasoningTokens: res.reasoningTokens,
            ...(check.ok ? { summary: check.summary } : { reason: check.reason, summary: res.content ?? '' }),
        };
    } catch (e) {
        const code = e instanceof SourceError ? e.code : 'ERROR';
        const message = e instanceof Error ? e.message : String(e);
        return {
            sample: sample.name,
            ms: Date.now() - started,
            error: redact(`${code} ${message}`).slice(0, 140),
            jsonOk: false,
            valid: false,
            reasoningTokens: 0,
        };
    }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const samples = await loadSamples();
const { primary, fallback } = resolveModels(process.env);
const results = new Map<string, Trial[]>();

for (const model of [primary, fallback]) {
    const trials: Trial[] = [];
    for (const sample of samples) {
        for (let i = 0; i < RUNS; i++) {
            const t = await runOnce(model, sample);
            trials.push(t);
            const mark = t.error ? `✗ ${t.error}` : t.valid ? '✓' : `△ ${t.reason}`;
            console.log(`${model.id} | ${sample.name} #${i + 1} | ${t.ms}ms | ${mark}`);
            await sleep(GAP_MS);
        }
    }
    results.set(model.id, trials);
}

console.log('\n=== 요약표 ===');
console.log('모델 | 호출 | 응답 성공 | JSON 준수 | 검증 통과 | 평균 ms | 최대 ms | 추론 토큰 발생');
for (const [id, trials] of results) {
    const answered = trials.filter((t) => !t.error);
    const avg = answered.length ? Math.round(answered.reduce((s, t) => s + t.ms, 0) / answered.length) : 0;
    const max = answered.length ? Math.max(...answered.map((t) => t.ms)) : 0;
    console.log(
        [
            id,
            trials.length,
            answered.length,
            trials.filter((t) => t.jsonOk).length,
            trials.filter((t) => t.valid).length,
            avg,
            max,
            trials.filter((t) => t.reasoningTokens > 0).length,
        ].join(' | '),
    );
}

console.log('\n=== 요약문 (원문별 첫 성공 응답) ===');
for (const [id, trials] of results) {
    console.log(`\n## ${id}`);
    for (const sample of samples) {
        const t = trials.find((x) => x.sample === sample.name && x.summary);
        console.log(`- [${sample.name}] ${t ? `${t.valid ? '' : `(검증 실패: ${t.reason}) `}${t.summary}` : '(응답 없음)'}`);
    }
}
