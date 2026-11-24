import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ContentItem } from '../../src/core/types.js';
import { parseCultureInfo } from '../../src/providers/cultureInfo.js';
import { parseHotTrend } from '../../src/providers/data4library.js';
import { parseKobisList } from '../../src/providers/kobis.js';
import { parseKopisBoxOffice } from '../../src/providers/kopis.js';
import { parseNlRecommend } from '../../src/providers/nlRecommend.js';
import { parseSeoulCulture } from '../../src/providers/seoulCulture.js';
import { parseTourFestivals } from '../../src/providers/tourApi.js';
import { formatSelectDebug, isOngoing, rotate, selectCategories } from '../../src/pipeline/select.js';

const MON = '2026-10-26';
const TUE = '2026-10-27';

let seq = 0;
const item = (over: Partial<ContentItem> & Pick<ContentItem, 'source' | 'category'>): ContentItem => {
    seq += 1;
    return { id: `${over.source}:${seq}`, sourceId: String(seq), title: `항목${seq}`, metrics: {}, ...over };
};

const movie = (rank: number, isNew = false) => item({ source: 'kobis', category: 'movie', title: `영화${rank}`, metrics: { rank, isNew } });

const pickOf = (items: ContentItem[], today: string, category: ContentItem['category']) =>
    selectCategories(items, today).find((s) => s.category === category)!;

describe('isOngoing', () => {
    it('오늘 끝나는 항목은 남기고 어제 끝난 항목은 뺌', () => {
        expect(isOngoing(item({ source: 'kopis', category: 'performance', endDate: MON }), MON)).toBe(true);
        expect(isOngoing(item({ source: 'kopis', category: 'performance', endDate: '2026-10-25' }), MON)).toBe(false);
    });

    it('종료일이 없는 항목(영화·도서 등)은 남김', () => {
        expect(isOngoing(movie(1), MON)).toBe(true);
    });
});

describe('rotate', () => {
    it('다음 날은 시작 위치가 하나씩 밀리고 최대 3개', () => {
        const list = [1, 2, 3, 4, 5].map((r) => movie(r));
        const mon = rotate(list, MON);
        const tue = rotate(list, TUE);
        expect(mon).toHaveLength(3);
        expect(list.indexOf(tue[0]!)).toBe((list.indexOf(mon[0]!) + 1) % 5);
        expect(tue[1]).toBe(list[(list.indexOf(tue[0]!) + 1) % 5]);
    });
});

describe('영화', () => {
    it('상위 5위 안에서만 순환', () => {
        const list = [1, 2, 3, 4, 5, 6, 7].map((r) => movie(r));
        const days = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'];
        const ranks = days.map((d) => pickOf(list, d, 'movie').picks[0]!.metrics.rank);
        expect(new Set(ranks)).toEqual(new Set([1, 2, 3, 4, 5]));
    });

    it('신규 진입작이 있으면 그 영화를 먼저', () => {
        const list = [movie(1), movie(2), movie(7, true)];
        expect(pickOf(list, MON, 'movie').picks[0]!.title).toBe('영화7');
    });
});

describe('공연', () => {
    const kopis = (rank: number, region: string, startDate = '2026-10-01') =>
        item({ source: 'kopis', category: 'performance', title: `K${rank}${region}`, region, startDate, endDate: '2026-12-31', metrics: { rank } });
    const seoul = (title: string, startDate: string, endDate: string) =>
        item({ source: 'seoulCulture', category: 'performance', title, region: '종로구', startDate, endDate });

    it('KOPIS 수도권 → 서울 → KOPIS 지방, 14일 넘게 남은 공연은 제외', () => {
        const s = pickOf(
            [kopis(1, '부산'), seoul('서울A', '2026-10-28', '2026-10-28'), kopis(3, '서울'), kopis(2, '경기', '2026-11-10'), kopis(4, '인천')],
            MON,
            'performance',
        );
        expect(s.rotation.map((i) => i.title)).toEqual(['K3서울', 'K4인천', '서울A', 'K1부산']);
        expect(s.total).toBe(4);
    });

    it('서울 공연은 진행 중(종료 임박순) 다음 예정(시작 임박순)', () => {
        const s = pickOf(
            [seoul('예정2', '2026-11-02', '2026-11-02'), seoul('진행', '2026-10-01', '2026-10-30'), seoul('예정1', '2026-10-28', '2026-10-28')],
            MON,
            'performance',
        );
        expect(s.rotation.map((i) => i.title)).toEqual(['진행', '예정1', '예정2']);
    });
});

describe('행사', () => {
    const ev = (title: string, startDate: string, endDate: string, extra: Partial<ContentItem> = {}) =>
        item({ source: 'cultureInfo', category: 'event', title, region: '서울', startDate, endDate, ...extra });
    const exhibition = (title: string, startDate: string, endDate: string) => ev(title, startDate, endDate, { genre: '전시' });

    it('오늘 끝나는 것, 60일 넘는 상설, 7일 넘게 남은 것은 제외', () => {
        const s = pickOf(
            [
                ev('오늘끝', '2026-10-20', MON),
                ev('상설', '2026-01-01', '2026-12-31'),
                ev('먼미래', '2026-11-05', '2026-11-06'),
                ev('남음', '2026-10-20', '2026-10-28'),
            ],
            MON,
            'event',
        );
        expect(s.rotation.map((i) => i.title)).toEqual(['남음']);
    });

    it('60일 넘는 기간 제외는 전시에는 적용하지 않음', () => {
        const s = pickOf([exhibition('기획전', '2026-07-21', '2026-11-01')], TUE, 'event');
        expect(s).toMatchObject({ group: '전시', total: 1 });
    });

    it('7일 내 시작(시작 임박순) 다음 진행 중(종료 임박순)', () => {
        const s = pickOf(
            [ev('진행B', '2026-10-01', '2026-11-20'), ev('예정2', '2026-10-30', '2026-11-01'), ev('진행A', '2026-10-10', '2026-10-29'), ev('예정1', '2026-10-28', '2026-10-28')],
            MON,
            'event',
        );
        expect(s.rotation.map((i) => i.title)).toEqual(['예정1', '예정2', '진행A', '진행B']);
    });

    it('월요일은 축제·행사, 화요일은 전시. 고른 그룹이 비면 다른 그룹', () => {
        const items = [ev('축제', '2026-10-20', '2026-10-30'), exhibition('전시회', '2026-10-20', '2026-10-30')];
        expect(pickOf(items, MON, 'event')).toMatchObject({ group: '축제·행사', total: 2 });
        expect(pickOf(items, TUE, 'event').group).toBe('전시');
        expect(pickOf([items[0]!], TUE, 'event').group).toBe('축제·행사');
    });

    it('수도권 5건 이상이면 수도권만, 미만이면 지방을 뒤에 이어 붙임', () => {
        const local = ev('지방', '2026-10-27', '2026-10-28', { region: '부산' });
        const capital = (n: number) => Array.from({ length: n }, (_, i) => ev(`수도권${i}`, '2026-10-20', '2026-10-30'));
        const enough = pickOf([local, ...capital(5)], MON, 'event');
        expect(enough.rotation.map((i) => i.title)).not.toContain('지방');
        expect(enough.total).toBe(6);
        expect(pickOf([local, ...capital(2)], MON, 'event').rotation.map((i) => i.title)).toEqual(['수도권0', '수도권1', '지방']);
    });

    it('tourApi는 주소로 수도권 판단', () => {
        const tour = (title: string, venue: string) =>
            item({ source: 'tourApi', category: 'event', title, venue, startDate: '2026-10-20', endDate: '2026-10-30' });
        const s = pickOf([tour('지방', '부산광역시 수영구'), tour('경기', '경기도 양주시')], MON, 'event');
        expect(s.rotation.map((i) => i.title)).toEqual(['경기', '지방']);
    });

    it('소스가 달라도 같은 제목은 하나만', () => {
        const tour = item({ source: 'tourApi', category: 'event', title: '2026 화성행궁 야간개장', venue: '경기도 수원시', startDate: '2026-10-20', endDate: '2026-10-30' });
        const s = pickOf([tour, ev('2026 화성행궁  야간개장', '2026-10-20', '2026-10-30')], MON, 'event');
        expect(s.total).toBe(1);
    });
});

describe('서적', () => {
    const nl = (n: number) => item({ source: 'nlRecommend', category: 'book', title: `추천${n}`, metrics: { recommended: true } });
    const trend = (rank: number) => item({ source: 'data4library', category: 'book', title: `급상승${rank}`, metrics: { rank } });

    it('사서추천은 상위 5권이 아니라 전체를 순환, 후보 수는 정보나루와 합산', () => {
        const s = pickOf([...Array.from({ length: 8 }, (_, i) => nl(i)), trend(1)], MON, 'book');
        expect(s).toMatchObject({ group: '사서추천', total: 9 });
        expect(s.rotation).toHaveLength(8);
    });

    it('사서추천이 없으면 정보나루 상위 5권 순환', () => {
        const s = pickOf([6, 1, 2, 3, 4, 5].map(trend), MON, 'book');
        expect(s.group).toBe('정보나루');
        expect(s.rotation.map((i) => i.metrics.rank)).toEqual([1, 2, 3, 4, 5]);
    });
});

describe('fixture 전체 (2026-10-26 기준 고정)', () => {
    const text = (path: string) => readFileSync(`fixtures/${path}`, 'utf8');
    const items = [
        ...parseKobisList(JSON.parse(text('kobis/list.json'))),
        ...parseKopisBoxOffice(text('kopis/boxoffice.xml')),
        ...parseSeoulCulture(text('seoulCulture/list.json')),
        ...parseTourFestivals(text('tourApi/list.json')),
        ...parseCultureInfo(text('cultureInfo/list.xml')),
        ...parseNlRecommend(text('nlRecommend/list.xml')),
        ...parseHotTrend(JSON.parse(text('data4library/hottrend.json'))),
    ];

    it('4개 분야 모두 선정되고 디버그 출력에 분야가 다 나옴', () => {
        const selections = selectCategories(items, MON);
        expect(selections.map((s) => s.picks.length > 0)).toEqual([true, true, true, true]);
        const debug = formatSelectDebug(selections, MON);
        for (const label of ['[영화]', '[공연]', '[행사] 축제·행사', '[서적] 사서추천']) expect(debug).toContain(label);
    });
});
