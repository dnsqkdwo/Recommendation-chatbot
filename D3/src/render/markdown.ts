// 사용자 메시지 렌더. 제목·날짜·장소·링크는 API 값을 그대로 씀 (요약 줄은 Day 5에 추가)

import { kstDate, kstWeekday } from '../core/clock.js';
import type { Category, ContentItem, SourceName } from '../core/types.js';

const CATEGORY_LABEL: Record<Category, string> = {
    movie: '영화',
    performance: '공연',
    event: '행사',
    book: '서적',
};

const SOURCE_LABEL: Partial<Record<SourceName, string>> = {
    kobis: 'KOBIS 영화관입장권통합전산망',
    kopis: 'KOPIS 공연예술통합전산망',
    seoulCulture: '서울 열린데이터광장 문화행사 정보',
};

function renderItem(item: ContentItem): string {
    const title = item.link ? `[${item.title}](${item.link})` : item.title;
    const lines = [`**[${CATEGORY_LABEL[item.category]}] ${title}**`];

    if (item.category === 'movie') {
        if (item.startDate) lines.push(`- 개봉: ${item.startDate}`);
        const { rank, audience } = item.metrics;
        const stats = [
            rank !== undefined ? `박스오피스 ${rank}위` : '',
            audience !== undefined ? `누적 관객 ${audience.toLocaleString('ko-KR')}명` : '',
        ].filter(Boolean);
        if (stats.length > 0) lines.push(`- ${stats.join(' · ')}`);
    }

    if (item.category === 'performance') {
        if (item.startDate) {
            const period = item.endDate && item.endDate !== item.startDate ? `${item.startDate} ~ ${item.endDate}` : item.startDate;
            lines.push(`- 기간: ${period}`);
        }
        if (item.venue) lines.push(`- 장소: ${item.venue}${item.region ? ` (${item.region})` : ''}`);
        if (item.metrics.rank !== undefined) lines.push(`- 예매상황판 ${item.metrics.rank}위`);
    }

    lines.push(`- 출처: ${SOURCE_LABEL[item.source] ?? item.source}`);
    return lines.join('\n');
}

/** items는 분야 순서(영화 → 공연 → 행사 → 서적)로 정렬되어 있어야 함 */
export function renderMessage(sendDate: Date, items: readonly ContentItem[]): string {
    const heading = `#### 오늘의 문화 추천 · ${kstDate(sendDate)} (${kstWeekday(sendDate)})`;
    return [heading, ...items.map(renderItem)].join('\n\n');
}
