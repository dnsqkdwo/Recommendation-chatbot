// 목록 수집 대상 provider 등록부. 새 소스는 여기에 한 줄 추가
// KMDb는 상세 조회 전용이라 넣지 않음

import type { Provider } from '../core/types.js';
import { kobisProvider } from './kobis.js';
import { kopisProvider } from './kopis.js';
import { seoulCultureProvider } from './seoulCulture.js';

export const providers: readonly Provider[] = [kobisProvider, kopisProvider, seoulCultureProvider];
