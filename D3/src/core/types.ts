import type { Clock } from './clock.js';

export type Category = 'movie' | 'performance' | 'event' | 'book';

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
    | 'MATTERMOST_ADMIN_WEBHOOK_URL';

export type Env = Readonly<Record<EnvKey, string>>;

export interface ContentItem {
    id: string; // `${source}:${원본 id}`
    sourceId: string; // 상세 조회에 쓸 원본 id
    source: SourceName;
    category: Category;
    title: string;
    startDate?: string; // YYYY-MM-DD (KST) 
    endDate?: string;
    venue?: string;
    region?: string;
    link?: string;
    imageUrl?: string;
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

export interface Provider {
    name: SourceName;
    category: Category;
    fetchList(ctx: RunContext): Promise<ContentItem[]>;
    fetchDetail?(item: ContentItem, ctx: RunContext): Promise<string | null>; // 요약용 설명문. 없으면 null
}
