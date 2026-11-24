// URL·키는 절대 포함하지 않음. detail은 AppError 생성 시 이미 redact() 처리됨

import type { AppError, ErrorCode } from '../core/errors.js';
import { CATEGORY_LABEL, type Category } from '../core/types.js';

// notify가 config를 import하지 않도록 config 대신 여기 둠
export const ADMIN_PREFIX = '[관리자]';

const HINTS: Partial<Record<ErrorCode, string>> = {
    AUTH_ERROR: '키 오타·승인·만료 확인 필요',
};

// AppError를 한 줄 요약 문자열로 변환
function line(error: AppError): string {
    const time = error.at.slice(11, 19);
    const hint =
        error.code === 'ENV_MISSING'
            ? `${error.detail ?? ''} 비어 있음`
            : (HINTS[error.code] ?? error.detail);
    return `- [${error.source}] ${error.code} ${time}${hint ? ` (${hint})` : ''}`;
}

export interface CandidateCount {
    category: Category;
    total: number;
    low: boolean; // 후보 부족 여부. 기준은 호출 측에서 정함
}

// 관리자용 실행 결과 메시지. candidates는 선정 단계까지 갔을 때만 넘김
export function formatAdminMessage(
    date: string,
    sentCategories: number,
    errors: readonly AppError[],
    candidates: readonly CandidateCount[] = [],
): string {
    const counts = candidates.map((c) => `${CATEGORY_LABEL[c.category]} ${c.total}`).join(' / ');
    return [
        `${ADMIN_PREFIX} ${date} 실행 결과: 발송 ${sentCategories}개 분야 / 실패 ${errors.length}건`,
        ...(counts ? [`- 후보: ${counts}`] : []),
        ...candidates.filter((c) => c.low).map((c) => `- [${CATEGORY_LABEL[c.category]}] 후보 부족 ${c.total}건`),
        ...errors.map(line),
    ].join('\n');
}
