import { describe, expect, it } from 'vitest';
import { createClock } from '../../src/core/clock.js';
import { SourceError } from '../../src/core/errors.js';
import type { Env, Provider, RunContext } from '../../src/core/types.js';
import { collect } from '../../src/pipeline/collect.js';
import { kobisProvider } from '../../src/providers/kobis.js';
import { kopisProvider } from '../../src/providers/kopis.js';
import { seoulCultureProvider } from '../../src/providers/seoulCulture.js';

const ctx: RunContext = {
    now: createClock('2026-10-19T16:30:00+09:00'),
    useFixtures: true,
    httpTimeoutMs: 10_000,
    env: new Proxy({}, { get: () => 'test' }) as Env,
};

const failing = (name: Provider['name'], error: unknown): Provider => ({
    name,
    category: 'performance',
    fetchList: () => Promise.reject(error),
});

describe('collect', () => {
    it('fixture로 등록 소스 전부 수집', async () => {
        const { counts, errors } = await collect([kobisProvider, kopisProvider, seoulCultureProvider], ctx);
        expect(counts).toEqual([
            { source: 'kobis', count: 10 },
            { source: 'kopis', count: 50 },
            { source: 'seoulCulture', count: 350 },
        ]);
        expect(errors).toEqual([]);
    });

    it('소스 하나가 타임아웃이어도 나머지는 끝까지 수집', async () => {
        const { items, counts, errors } = await collect(
            [kobisProvider, failing('kopis', new SourceError('TIMEOUT', '10000ms 초과')), seoulCultureProvider],
            ctx,
        );
        expect(counts.map((c) => c.source)).toEqual(['kobis', 'seoulCulture']);
        expect(items).toHaveLength(360);
        expect(errors).toEqual([
            { source: 'kopis', code: 'TIMEOUT', detail: '10000ms 초과', at: '2026-10-19T16:30:00+09:00' },
        ]);
    });

    it('SourceError가 아닌 예외는 API_ERROR로 기록', async () => {
        const { errors } = await collect([failing('seoulCulture', new Error('boom'))], ctx);
        expect(errors.map((e) => [e.source, e.code])).toEqual([['seoulCulture', 'API_ERROR']]);
    });

    it('전부 실패해도 예외를 던지지 않음', async () => {
        const result = await collect(
            [failing('kopis', new SourceError('AUTH_ERROR', 'x')), failing('seoulCulture', new SourceError('HTTP_ERROR', 'x'))],
            ctx,
        );
        expect(result.items).toEqual([]);
        expect(result.errors.map((e) => e.code)).toEqual(['AUTH_ERROR', 'HTTP_ERROR']);
    });
});
