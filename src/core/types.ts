import type { Clock } from './clock.js';

export type Category = 'movie' | 'performance' | 'event' | 'book';

// 메시지·관리자 통지·디버그 출력 공용
export const CATEGORY_LABEL: Record<Category, string> = {
    movie: '영화',
    performance: '공연',
    event: '행사',
    book: '서적',
};

export type SourceName =
    | 'kobis'
    | 'kmdb'
    | 'kopis'
    | 'seoulCulture'
    | 'tourApi'
    | 'cultureInfo'
    | 'festivalStd'
    | 'nlRecommend'
    | 'data4library'
    | 'seoulLibrary';

export type EnvKey =
    | 'DATA_GO_KR_SERVICE_KEY'
    | 'KOBIS_API_KEY'
    | 'KMDB_API_KEY'
    | 'KOPIS_SERVICE_KEY'
    | 'SEOUL_OPENAPI_KEY'
    | 'NL_API_KEY'
    | 'DATA4LIBRARY_AUTH_KEY'
    | 'OPENROUTER_API_KEY'
    | 'MATTERMOST_WEBHOOK_URL'
    | 'MATTERMOST_ADMIN_WEBHOOK_URL'
    | 'HOLIDAY_API_URL';

export type Env = Readonly<Record<EnvKey, string>>;

/** OpenRouter 모델 ID와 모델별 요청 옵션. 모델을 바꿀 때 옵션도 함께 맞춤 */
export interface LlmModel {
    id: string;
    jsonMode: boolean;
    reasoningOff: boolean; // 사고 모드 끔. 사고 모드 필수 모델에 보내면 400
}

export interface ContentItem {
    id: string;
    sourceId: string;
    source: SourceName;
    category: Category;
    title: string;
    startDate?: string;
    endDate?: string;
    venue?: string;
    region?: string;
    link?: string;
    imageUrl?: string;
    author?: string;
    publisher?: string;
    genre?: string;
    description?: string;
    metrics: {
        rank?: number;
        audience?: number;
        reservationRate?: number;
        recommended?: boolean;
        isNew?: boolean;
    };
}

export interface RunContext {
    now: Clock;
    useFixtures: boolean;
    httpTimeoutMs: number;
    env: Env;
}

/** 코드가 API 값을 그대로 표시하는 상세 항목. LLM에 넘기지 않음 */
export interface Fact {
    label: string;
    value: string;
}

export interface DetailInfo {
    description: string | null; // 요약용 설명문. 없으면 null
    facts: Fact[];
    link?: string; // 목록에 링크가 없는 소스만 상세에서 채움
}

export interface Provider {
    name: SourceName;
    category: Category;
    fetchList(ctx: RunContext): Promise<ContentItem[]>;
    fetchDetail?(item: ContentItem, ctx: RunContext): Promise<DetailInfo>;
}
