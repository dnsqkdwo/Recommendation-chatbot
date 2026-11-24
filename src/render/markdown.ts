// 사용자 메시지 렌더. 제목·날짜·장소·상세 항목은 API 값을 그대로 쓰고, LLM 결과는 요약 줄에만 씀

import { kstDate, kstWeekday } from '../core/clock.js';
import { CATEGORY_LABEL, type ContentItem, type Fact, type SourceName } from '../core/types.js';

const SOURCE_LABEL: Partial<Record<SourceName, string>> = {
    kobis: 'KOBIS 영화관입장권통합전산망',
    kopis: 'KOPIS 공연예술통합전산망',
    seoulCulture: '서울 열린데이터광장 문화행사 정보',
    tourApi: '한국관광콘텐츠랩',
    cultureInfo: '한눈에보는문화정보',
    nlRecommend: '국립중앙도서관 사서추천도서',
    data4library: '도서관 정보나루',
};

const CATEGORY_EMOJI: Record<ContentItem['category'], string> = {
    movie: '🎬',
    performance: '🎭',
    event: '🎨',
    book: '📚',
};

export interface RenderEntry {
    item: ContentItem;
    summary?: string; // 없으면 요약 줄 없이 보냄
    facts: Fact[];
}

function renderEntry({ item, summary, facts }: RenderEntry): string {
    // 링크는 메시지에 넣지 않음
    const lines = [`**${CATEGORY_EMOJI[item.category]} [${CATEGORY_LABEL[item.category]}] ${item.title}**`];

    if (item.category === 'movie') {
        if (item.startDate) lines.push(`- 개봉: ${item.startDate}`);
        const { rank, audience } = item.metrics;
        const stats = [
            rank !== undefined ? `박스오피스 ${rank}위` : '',
            audience !== undefined ? `누적 관객 ${audience.toLocaleString('ko-KR')}명` : '',
        ].filter(Boolean);
        if (stats.length > 0) lines.push(`- ${stats.join(' · ')}`);
    }

    // 공연·행사는 기간·장소 줄이 같음
    if (item.category === 'performance' || item.category === 'event') {
        if (item.startDate) {
            const period = item.endDate && item.endDate !== item.startDate ? `${item.startDate} ~ ${item.endDate}` : item.startDate;
            lines.push(`- 기간: ${period}`);
        }
        if (item.venue) lines.push(`- 장소: ${item.venue}${item.region ? ` (${item.region})` : ''}`);
        if (item.category === 'performance' && item.metrics.rank !== undefined) lines.push(`- 예매상황판 ${item.metrics.rank}위`);
    }

    if (item.category === 'book') {
        // 저자 값에 역할(지은이·지음·옮긴이)이 붙어 와서 라벨 없이 그대로 씀
        const book = [item.author ?? '', item.publisher ? `출판사: ${item.publisher}` : ''].filter(Boolean);
        if (book.length > 0) lines.push(`- ${book.join(' / ')}`);
    }

    if (facts.length > 0) lines.push(`- ${facts.map((f) => `${f.label}: ${f.value}`).join(' / ')}`);

    // 목록 바로 뒤에 붙이면 마지막 항목에 이어 붙으므로 빈 줄로 나눔. 요약은 인용문으로 정보 줄과 구분
    const tail = [
        ...(summary ? [summary.split('\n').map((line) => `> ${line}`).join('\n')] : []),
        `*출처: ${SOURCE_LABEL[item.source] ?? item.source}*`,
    ];
    return [lines.join('\n'), ...tail].join('\n\n');
}

/** entries는 분야 순서(영화 → 공연 → 행사 → 서적)로 정렬되어 있어야 함 */
export function renderMessage(sendDate: Date, entries: readonly RenderEntry[]): string {
    const heading = `#### 오늘의 문화 추천 · ${kstDate(sendDate)} (${kstWeekday(sendDate)})`;
    // 구분선 바로 위가 글 줄이면 제목으로 바뀌므로 앞뒤에 빈 줄을 둠
    return `${heading}\n\n${entries.map(renderEntry).join('\n\n---\n\n')}`;
}
