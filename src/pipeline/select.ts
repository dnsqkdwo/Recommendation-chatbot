// 분야별 후보 정렬과 날짜 순환 선정. DB가 없어 같은 작품 반복을 날짜 순환으로 피함

import { normalizeTitle } from '../core/text.js';
import { CATEGORY_LABEL, type Category, type ContentItem } from '../core/types.js';

// 메시지로 보낼 분야 순서 ( 영화 -> 공연 -> 행사 -> 책 )
export const CATEGORY_ORDER: readonly Category[] = ['movie', 'performance', 'event', 'book'];

export const ROTATION_SIZE = 5;
export const LOW_CANDIDATE_COUNT = 5; // 이 수 미만이면 관리자 메시지에 후보 부족 표시
const MAX_TRIES = 3; // 설명문을 못 구하면 다음 후보로, 최대 3개
const PERFORMANCE_WINDOW_DAYS = 14;
const EVENT_WINDOW_DAYS = 7;
const LONG_RUN_DAYS = 60; // 이보다 긴 축제·행사는 상설로 보고 제외. 전시는 기획전이 2~3개월이라 적용 안 함
const EXHIBITION = '전시';
const CAPITAL = /^(서울|경기|인천)/;
const DAY_MS = 86400_000;

export interface CategorySelection {
    category: Category;
    group?: string; // 행사: 축제·행사/전시, 서적: 사서추천/정보나루
    total: number; // 필터·중복 제거 후 후보 수
    rotation: readonly ContentItem[]; // 날짜 순환 대상
    picks: readonly ContentItem[]; // 오늘 선정 순서. 첫 건이 선정, 나머지는 설명문 실패 시 대체
}

/** 종료일이 today(YYYY-MM-DD, KST)보다 이전이면 false. 종료일이 없으면 남김 */
export const isOngoing = (item: ContentItem, today: string): boolean =>
    item.endDate === undefined || item.endDate >= today;

const dayNumber = (date: string): number => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

// 시작까지 남은 일수. 이미 시작했거나 시작일이 없으면 0 이하
const daysUntilStart = (item: ContentItem, today: string): number =>
    item.startDate ? dayNumber(item.startDate) - dayNumber(today) : 0;

const durationDays = (item: ContentItem): number =>
    item.startDate && item.endDate ? dayNumber(item.endDate) - dayNumber(item.startDate) : 0;

const rankOf = (item: ContentItem): number => item.metrics.rank ?? Infinity;

const byEnd = (a: ContentItem, b: ContentItem): number => (a.endDate ?? '9999').localeCompare(b.endDate ?? '9999');

// 서울 열린데이터광장은 region이 구 이름이라 소스로 판단. tourApi는 region이 없어 주소로 판단
const isCapital = (item: ContentItem): boolean =>
    item.source === 'seoulCulture' || CAPITAL.test(item.region ?? item.venue ?? '');

// 정렬된 목록에서 같은 제목은 앞의 것만 남김
function dedupe(items: readonly ContentItem[]): ContentItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
        const key = normalizeTitle(item.title);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** 날짜 일련번호로 시작 위치를 정해 순환 순서로 최대 MAX_TRIES개 반환 */
export function rotate(list: readonly ContentItem[], today: string): ContentItem[] {
    if (list.length === 0) return [];
    const start = dayNumber(today) % list.length;
    return [...list.slice(start), ...list.slice(0, start)].slice(0, MAX_TRIES);
}

function movieSelection(items: ContentItem[], today: string): CategorySelection {
    const sorted = dedupe([...items].sort((a, b) => rankOf(a) - rankOf(b)));
    const rotation = sorted.slice(0, ROTATION_SIZE);
    const fresh = sorted.filter((item) => item.metrics.isNew);
    const picks = dedupe([...fresh, ...rotate(rotation, today)]).slice(0, MAX_TRIES);
    return { category: 'movie', total: sorted.length, rotation, picks };
}

// KOPIS 수도권(순위순) → 서울(진행 중은 종료 임박순, 예정은 시작 임박순) → KOPIS 지방(순위순)
function performanceSelection(items: ContentItem[], today: string): CategorySelection {
    const tier = (item: ContentItem): number => (item.source !== 'kopis' ? 1 : isCapital(item) ? 0 : 2);
    const sorted = dedupe(
        items
            .filter((item) => daysUntilStart(item, today) <= PERFORMANCE_WINDOW_DAYS)
            .sort(
                (a, b) =>
                    tier(a) - tier(b) ||
                    rankOf(a) - rankOf(b) ||
                    Math.max(0, daysUntilStart(a, today)) - Math.max(0, daysUntilStart(b, today)) ||
                    byEnd(a, b),
            ),
    );
    const rotation = sorted.slice(0, ROTATION_SIZE);
    return { category: 'performance', total: sorted.length, rotation, picks: rotate(rotation, today) };
}

// 7일 내 시작(시작 임박순) → 진행 중(종료 임박순). 수도권 후보가 부족하면 지방 후보를 뒤에 이어 붙임
function orderEvents(items: readonly ContentItem[], today: string): ContentItem[] {
    const upcoming = items.filter((item) => daysUntilStart(item, today) > 0);
    const started = items.filter((item) => daysUntilStart(item, today) <= 0);
    const ordered = [
        ...upcoming.sort((a, b) => daysUntilStart(a, today) - daysUntilStart(b, today) || byEnd(a, b)),
        ...started.sort(byEnd),
    ];
    const capital = ordered.filter(isCapital);
    return capital.length >= ROTATION_SIZE ? capital : [...capital, ...ordered.filter((item) => !isCapital(item))];
}

// 월·수·금은 축제·행사, 화·목은 전시. 고른 그룹이 비면 다른 그룹
function eventSelection(items: ContentItem[], today: string): CategorySelection {
    // 오후 5시 발송이라 오늘 끝나는 행사는 갈 수 없음
    const pool = dedupe(
        items.filter(
            (item) =>
                (item.endDate === undefined || item.endDate > today) &&
                daysUntilStart(item, today) <= EVENT_WINDOW_DAYS,
        ),
    );
    const festivalPool = pool.filter((item) => item.genre !== EXHIBITION && durationDays(item) <= LONG_RUN_DAYS);
    const exhibitionPool = pool.filter((item) => item.genre === EXHIBITION);
    const festivals = orderEvents(festivalPool, today);
    const exhibitions = orderEvents(exhibitionPool, today);
    const weekday = new Date(dayNumber(today) * DAY_MS).getUTCDay();
    const preferExhibition = weekday === 2 || weekday === 4;
    const useExhibition = preferExhibition ? exhibitions.length > 0 : festivals.length === 0;
    const group = useExhibition ? exhibitions : festivals;
    const rotation = group.slice(0, ROTATION_SIZE);
    return {
        category: 'event',
        group: useExhibition ? '전시' : '축제·행사',
        total: festivalPool.length + exhibitionPool.length,
        rotation,
        picks: rotate(rotation, today),
    };
}

// 최근 1년 사서추천 전체를 순환. 없으면 정보나루 상위 5권
function bookSelection(items: ContentItem[], today: string): CategorySelection {
    const librarian = dedupe(items.filter((item) => item.metrics.recommended));
    const trending = dedupe(
        items.filter((item) => !item.metrics.recommended).sort((a, b) => rankOf(a) - rankOf(b)),
    );
    const useLibrarian = librarian.length > 0;
    const rotation = useLibrarian ? librarian : trending.slice(0, ROTATION_SIZE);
    return {
        category: 'book',
        group: useLibrarian ? '사서추천' : '정보나루',
        total: librarian.length + trending.length,
        rotation,
        picks: rotate(rotation, today),
    };
}

const SELECTORS: Record<Category, (items: ContentItem[], today: string) => CategorySelection> = {
    movie: movieSelection,
    performance: performanceSelection,
    event: eventSelection,
    book: bookSelection,
};

/** 분야별 선정 결과를 CATEGORY_ORDER 순서로 반환. 종료된 항목은 모든 소스 공통으로 제외. 후보가 없으면 picks가 빔 */
export function selectCategories(items: readonly ContentItem[], today: string): CategorySelection[] {
    const ongoing = items.filter((item) => isOngoing(item, today));
    return CATEGORY_ORDER.map((category) =>
        SELECTORS[category](
            ongoing.filter((item) => item.category === category),
            today,
        ),
    );
}

function debugRow(item: ContentItem): string {
    const period = item.startDate ? `${item.startDate}${item.endDate && item.endDate !== item.startDate ? `~${item.endDate}` : ''}` : '';
    return [
        item.title,
        `${item.source}${item.metrics.rank !== undefined ? ` ${item.metrics.rank}위` : ''}`,
        item.genre ?? '',
        period,
        item.region ?? item.venue ?? '',
    ]
        .filter(Boolean)
        .join(' | ');
}

/** 분야별 순환 대상 상위 5개와 오늘 선정·대체 후보 */
export function formatSelectDebug(selections: readonly CategorySelection[], today: string): string {
    const lines = [`--- 선정 디버그 (${today}) ---`];
    for (const s of selections) {
        const pick = s.picks[0];
        const position = pick ? s.rotation.indexOf(pick) + 1 : 0;
        lines.push(
            `[${CATEGORY_LABEL[s.category]}]${s.group ? ` ${s.group}` : ''} 후보 ${s.total}건 · 순환 ${s.rotation.length}개` +
                (s.total < LOW_CANDIDATE_COUNT ? ' · 후보 부족' : ''),
        );
        s.rotation.slice(0, ROTATION_SIZE).forEach((item, i) => lines.push(`  ${i + 1}. ${debugRow(item)}`));
        lines.push(
            pick
                ? `  → 선정(${s.category === 'movie' && pick.metrics.isNew ? '신규 진입' : `순환 ${position}번째`}): ${debugRow(pick)}`
                : '  → 선정 없음',
        );
        if (s.picks.length > 1) lines.push(`    대체: ${s.picks.slice(1).map((i) => i.title).join(' / ')}`);
    }
    return lines.join('\n');
}
