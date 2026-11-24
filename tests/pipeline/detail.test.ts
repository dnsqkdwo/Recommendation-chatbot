import { describe, expect, it } from 'vitest';
import { createClock } from '../../src/core/clock.js';
import { SourceError } from '../../src/core/errors.js';
import type { ContentItem, DetailInfo, Env, Provider, RunContext } from '../../src/core/types.js';
import { fetchDetails } from '../../src/pipeline/detail.js';
import type { CategorySelection } from '../../src/pipeline/select.js';

const ctx: RunContext = {
    now: createClock('2026-10-26T16:30:00+09:00'),
    useFixtures: true,
    httpTimeoutMs: 10_000,
    env: new Proxy({}, { get: () => 'test' }) as Env,
};

const LONG = '가'.repeat(60);

const show = (id: string, extra: Partial<ContentItem> = {}): ContentItem => ({
    id: `kopis:${id}`,
    sourceId: id,
    source: 'kopis',
    category: 'performance',
    title: `공연${id}`,
    metrics: {},
    ...extra,
});

const selection = (picks: ContentItem[], category: CategorySelection['category'] = 'performance'): CategorySelection => ({
    category,
    total: picks.length,
    rotation: picks,
    picks,
});

// sourceId별 상세 응답을 돌려주는 stub. Error면 던짐
const stub = (answers: Record<string, DetailInfo | Error>): Provider => ({
    name: 'kopis',
    category: 'performance',
    fetchList: () => Promise.resolve([]),
    fetchDetail: (item) => {
        const answer = answers[item.sourceId];
        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer ?? { description: null, facts: [] });
    },
});

describe('fetchDetails', () => {
    it('설명문이 50자 이상인 첫 후보를 고름', async () => {
        const provider = stub({ a: { description: '짧음', facts: [] }, b: { description: LONG, facts: [] } });
        const { picks, errors } = await fetchDetails([selection([show('a'), show('b'), show('c')])], [provider], ctx);
        expect(picks[0]).toMatchObject({ item: { sourceId: 'b' }, description: LONG, descriptionSource: 'kopis 상세' });
        expect(errors).toEqual([]);
    });

    it('3개 모두 설명문이 없으면 첫 후보를 요약 없이, 상세 항목은 그대로', async () => {
        const facts = [{ label: '공연시간', value: '2시간' }];
        const provider = stub({ a: { description: null, facts } });
        const { picks } = await fetchDetails([selection([show('a'), show('b'), show('c')])], [provider], ctx);
        expect(picks[0]).toMatchObject({ item: { sourceId: 'a' }, description: null, facts });
    });

    it('상세 조회 실패는 DETAIL_FAILED로 기록하고 다음 후보로', async () => {
        const provider = stub({ a: new SourceError('TIMEOUT', '10000ms 초과'), b: { description: LONG, facts: [] } });
        const { picks, errors } = await fetchDetails([selection([show('a'), show('b')])], [provider], ctx);
        expect(picks[0]?.item.sourceId).toBe('b');
        expect(errors).toMatchObject([{ source: 'kopis', code: 'DETAIL_FAILED', detail: 'TIMEOUT 10000ms 초과' }]);
    });

    it('목록에 설명문이 있으면 상세를 부르지 않음', async () => {
        const provider = stub({ a: new SourceError('TIMEOUT', 'x') });
        const { picks, errors } = await fetchDetails([selection([show('a', { description: LONG })])], [provider], ctx);
        expect(picks[0]).toMatchObject({ description: LONG, descriptionSource: 'kopis 목록' });
        expect(errors).toEqual([]);
    });

    it('영화는 KMDb에서 제목 + 개봉연도로 줄거리를 찾음 (fixture: 기생충)', async () => {
        const movie: ContentItem = {
            id: 'kobis:1',
            sourceId: '1',
            source: 'kobis',
            category: 'movie',
            title: '기생충',
            startDate: '2019-05-30',
            metrics: { rank: 1 },
        };
        const { picks } = await fetchDetails([selection([movie], 'movie')], [], ctx);
        expect(picks[0]?.descriptionSource).toBe('kmdb');
        expect(picks[0]?.description?.length).toBeGreaterThanOrEqual(50);
    });

    it('후보가 없는 분야는 결과에서 빠짐', async () => {
        const { picks } = await fetchDetails([selection([])], [], ctx);
        expect(picks).toEqual([]);
    });
});
