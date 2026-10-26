# 문화 추천 봇 (Recommendation chatbot)

평일 오후 5시에 **영화 · 공연 · 행사 · 서적**을 분야별로 1건씩 골라 Mattermost 채널에 보내는 봇임.
모든 정보는 공공기관의 공식 Open API에서만 가져옴. 크롤링은 하지 않고, DB 없이 실행 1회 안에서만 데이터를 다룸.

> 현재 개발 중. 6일 계획 중 3일차까지 진행했으며, 영화·공연 분야가 실제 데이터로 동작함.

---

## 무엇을 만드는가

```
평일 16:30 기동 (K8s CronJob)
  → 영업일 확인
  → 공공 API 10개에서 목록 수집 (병렬, 소스별 10초 타임아웃)
  → 분야별 1건 선정
  → 선정 건의 상세 설명 조회
  → 설명문 3~4문장 요약
  → 마크다운 메시지 작성
  → 17:00 정각에 Mattermost 발송
  → 실패한 소스·단계는 관리자 채널에 [관리자] 메시지로 한 번에 통지
```

### 메시지 예시 (현재 출력)

```
#### 오늘의 문화 추천 · 2026-10-19 (월)

**[영화] 극장판 치이카와: 인어 섬의 비밀**
- 개봉: 2026-09-30
- 박스오피스 1위 · 누적 관객 1,828,909명
- 출처: KOBIS 영화관입장권통합전산망

**[공연] AKMU CONCERT: 소문의 낙원 (Paradise of Rumors) [대구]**
- 기간: 2026-11-21 ~ 2026-11-22
- 장소: 엑스코(exco) 제1전시장(서관) (대구)
- 예매상황판 2위
- 출처: KOPIS 공연예술통합전산망
```

### 관리자 통지 예시

```
[관리자] 2026-10-19 실행 결과: 발송 2개 분야 / 실패 1건
- [seoulCulture] AUTH_ERROR 13:24:58 (키 오타·승인·만료 확인 필요)
```

통지에는 API 키나 Webhook URL이 절대 들어가지 않음. (아래 [보안](#보안) 참고)

---

## 개발 환경

| 항목 | 내용 |
|---|---|
| 언어 | **TypeScript 7.0** (strict, ESM) |
| 런타임 | **Node.js 22** (내장 `fetch`, 내장 `--env-file` 사용, dotenv 없음) |
| 패키지 매니저 | **Yarn 4** (`nodeLinker: node-modules`) |
| 테스트 | **Vitest 5** |
| 실행기 | tsx (개발 중 TypeScript 바로 실행) |
| 런타임 의존성 | `fast-xml-parser` 하나 (XML 응답 소스용) |
| OS | Windows (명령 프롬프트 기준으로 개발) |
| 배포 (예정) | Docker 이미지 + Kubernetes CronJob + K8s Secret |
| 알림 | Mattermost Incoming Webhook (사용자용 / 관리자용 2개) |

---

## 데이터 소스

| 분야 | 소스 | 기관 | 형식 | 상태 |
|---|---|---|---|---|
| 영화 | 일별 박스오피스 | KOBIS 영화관입장권통합전산망 | JSON | ✅ 구현 |
| 영화 | 영화 줄거리 (상세 전용) | KMDb 한국영화데이터베이스 | JSON | ✅ 구현 |
| 공연 | 예매상황판 · 공연 상세 | KOPIS 공연예술통합전산망 | XML | ✅ 구현 |
| 공연 | 서울 문화행사 정보 | 서울 열린데이터광장 | JSON | ✅ 구현 |
| 행사 | 축제·행사 검색 | 한국관광콘텐츠랩 (TourAPI) | JSON | 예정 |
| 행사 | 기간별 문화정보 | 한눈에보는문화정보 | XML | 예정 |
| 행사 | 전국문화축제표준데이터 | 공공데이터포털 | JSON | 예정 |
| 서적 | 사서추천도서 | 국립중앙도서관 | XML | 예정 |
| 서적 | 대출 급상승 도서 | 도서관 정보나루 | JSON | 예정 |
| 서적 | 서울도서관 신착도서 (선정 제외, 참고용) | 서울 열린데이터광장 | JSON | 예정 |

개발하면서 확인한 API 특이점:

- 대부분 **HTTP 200으로 오류를 돌려줌.** 본문의 결과 코드(`returncode`, `RESULT.CODE`, `faultInfo` 등)로 성공 여부를 판단함.
- 서울 열린데이터광장은 JSON 경로로 요청해도 **오류는 XML**로 옴. 본문 형태를 먼저 보고 분기함.
- XML은 결과가 1건이면 배열이 아니라 객체로 옴. 목록 필드는 항상 배열로 감싸서 처리함.
- KOPIS 예매상황판에는 이미 끝난 공연도 들어 있어, **종료일이 지난 항목은 모든 소스에서 공통으로 제외**함.

---

## 폴더 구조

```
├─ src/
│  ├─ index.ts          진입점. CLI 옵션·환경변수를 읽어 run() 실행, 종료 코드 설정
│  ├─ run.ts            전체 흐름 조립 (수집 → 선정 → 렌더 → 대기 → 발송 → 관리자 통지)
│  ├─ cli.ts            실행 옵션 파싱
│  ├─ config.ts         필수 환경변수 검증, 상수 (발송 시각 17:00 등)
│  ├─ core/             공용 도구 (다른 폴더를 import하지 않음)
│  │  ├─ types.ts       공통 타입 (ContentItem, Provider, RunContext)
│  │  ├─ http.ts        API 호출, 타임아웃, 오류 분류, fixture 모드 분기
│  │  ├─ errors.ts      오류 코드와 오류 객체
│  │  ├─ redact.ts      키·Webhook 값 마스킹
│  │  ├─ clock.ts       KST 날짜 계산, 현재 시각 주입, 17:00 대기
│  │  ├─ xml.ts         XML 파싱
│  │  ├─ text.ts        제목 정규화 (비교·중복 제거용)
│  │  └─ businessDay.ts 영업일 판정 (현재 스텁)
│  ├─ providers/        소스 1개 = 파일 1개. index.ts가 수집 대상 등록부
│  ├─ pipeline/         collect (병렬 수집), select (분야별 선정)
│  ├─ render/           Mattermost 마크다운 메시지 작성
│  ├─ deliver/          Webhook 발송 (실패 시 stderr에도 출력)
│  └─ notify/           실행 중 오류 수집, [관리자] 메시지 형식
├─ tests/               src 구조를 그대로 따라가는 단위 테스트
├─ fixtures/            실제 API 응답 샘플 (키는 마스킹됨). 테스트와 오프라인 실행에 사용
└─ scripts/
   ├─ envCheck.ts       키 상태 점검 (값은 출력하지 않음)
   └─ smoke.ts          소스별 API 1회 호출 → fixtures 저장
```

**의존 방향**: `index → run → pipeline → providers → core` 한 방향으로만 import함. 같은 층끼리는 import하지 않고, 공통 코드는 `core/`로 모음.

**새 소스 추가**: `providers/<소스>.ts`를 작성하고 `providers/index.ts` 등록부에 한 줄 추가하면 끝임. 다른 파일은 건드리지 않음.

---

## 실행 방법

### 1. 설치

```
yarn install
```

### 2. 환경변수

```
copy .env.example .env
```

`.env`에 각 기관에서 발급받은 키와 Mattermost Webhook URL을 채움. `.env`는 git에 올라가지 않음.

| 변수 | 용도 |
|---|---|
| `DATA_GO_KR_SERVICE_KEY` | 공공데이터포털 (TourAPI, 문화정보, 축제표준데이터). Decoding 키 |
| `KOBIS_API_KEY` | KOBIS |
| `KMDB_API_KEY` | KMDb |
| `KOPIS_SERVICE_KEY` | KOPIS |
| `SEOUL_OPENAPI_KEY` | 서울 열린데이터광장 (문화행사, 서울도서관 공용) |
| `NL_API_KEY` | 국립중앙도서관 |
| `DATA4LIBRARY_AUTH_KEY` | 도서관 정보나루 |
| `OPENROUTER_API_KEY` | 요약 단계용 (예정) |
| `MATTERMOST_WEBHOOK_URL` | 추천 메시지 발송 채널 |
| `MATTERMOST_ADMIN_WEBHOOK_URL` | 관리자 통지 채널 |

키가 제대로 들어갔는지 확인 (값은 출력하지 않고 상태·글자 수만 표시):

```
yarn env:check
```

### 3. 실행

```
yarn dev --dry-run --no-wait --skip-holiday
```

| 옵션 | 설명 |
|---|---|
| `--dry-run` | Mattermost로 보내지 않고 메시지를 콘솔에 출력 |
| `--no-wait` | 17:00까지 기다리지 않고 바로 진행 |
| `--skip-holiday` | 영업일 판정 생략 |
| `--use-fixtures` | 실제 API 대신 `fixtures/`의 저장된 응답 사용 (네트워크 없이 실행) |
| `--now=2026-10-19T16:30:00+09:00` | 현재 시각 주입 (대기·마감 로직 테스트용) |

### 4. 테스트 · 타입 검사

```
yarn test
yarn typecheck
```

현재 단위 테스트 57개가 통과함. 테스트는 저장된 fixture를 입력으로 쓰기 때문에 API 키 없이도 돌아감.

---

## 설계에서 신경 쓴 점

### 보안

- 실행 시작 시 모든 키·Webhook 값을 등록하고, 로그·관리자 통지·오류 메시지 등 **밖으로 나가는 모든 문자열에서 해당 값을 `***`로 치환**함. URL 인코딩된 형태도 함께 가림.
- fixture를 저장할 때도 같은 마스킹을 거침.
- `yarn env:check`는 키 값을 출력하지 않고 "OK / 비어 있음 / 경고(앞뒤 공백, 따옴표, 임시 값 등)"만 보여줌.

### 실패에 강하게

- 소스들은 `Promise.allSettled`로 병렬 호출함. **한 소스가 실패해도 나머지로 끝까지 진행**하고, 실패는 모아서 관리자에게 한 번에 알림.
- 오류는 `TIMEOUT`, `AUTH_ERROR`, `API_ERROR`, `PARSE_ERROR`, `EMPTY_RESPONSE` 등으로 분류함. 인증 오류에는 "키 오타·승인·만료 확인 필요" 힌트를 붙임.
- Webhook 두 개가 같은 채널을 쓸 수 있어서, **Mattermost 전송이 실패하면 stderr에도 반드시 출력**함. (K8s 로그가 최후의 확인 수단)

### 테스트하기 쉽게

- 실제 API 응답을 `fixtures/`에 저장해 두고, 파서는 그 파일을 입력으로 테스트함. API 필드명은 추측하지 않고 실제 응답을 보고 작성함.
- `--use-fixtures` 분기는 `core/http.ts` 한 곳에만 있어서, 소스 코드에는 테스트용 분기가 없음.
- 현재 시각을 주입할 수 있어 17:00 대기, 마감 같은 시간 로직을 테스트할 수 있음.

---

## 진행 상황

| 단계 | 내용 | 상태 |
|---|---|---|
| Day 1 | 개발 환경 구성, API 키 점검, 소스별 실제 응답 확인·저장 | ✅ |
| Day 2 | 골격 (공용 모듈, CLI, 오류 처리, 마스킹), KOBIS → Mattermost 첫 발송 | ✅ |
| Day 3 | 영화·공연 소스 (KMDb, KOPIS, 서울 문화행사), 병렬 수집, 실패 격리 테스트 | ✅ |
| Day 4 | 행사·서적 소스, 본 선정 기준 (중복 제거, 날짜 순환), 상세 조회 | 예정 |
| Day 5 | 설명문 요약, 16:55 마감 · 17:00 정시 발송, 영업일 판정 연동 | 예정 |
| Day 6 | Docker 이미지, Kubernetes CronJob 배포 | 예정 |
