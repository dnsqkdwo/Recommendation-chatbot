# agent-openplay

평일 오후 5시(KST)에 Mattermost 채널로 **오늘의 문화 추천**(영화·공연·행사·서적 각 1건)을 보내는 봇입니다.
공공 Open API에서 후보를 모아 분야별로 1건씩 고르고, 소개글을 LLM(OpenRouter)으로 요약해 메시지를 만듭니다.

- 제목·날짜·장소·순위 같은 정보는 API 값을 그대로 씁니다. LLM 결과는 요약 줄에만 씁니다.
- DB 없이 동작합니다. 같은 작품이 반복되지 않도록 날짜를 기준으로 후보를 순환합니다.
- 오류나 후보 부족이 있으면 관리자 채널로 따로 알립니다.

## 동작 흐름

`src/run.ts`가 아래 순서로 실행하고, 반환값을 프로세스 종료 코드로 씁니다.

1. **환경변수 확인**: 필수 키가 비어 있으면 관리자에게 알리고 종료합니다(종료 코드 1).
2. **영업일 판정**: 사내 Holiday API로 공휴일·사내 휴일을 확인합니다. 휴일이면 발송하지 않습니다. 판정에 실패하면 평일로 보고 진행합니다.
3. **수집**: `src/providers/index.ts`에 등록된 provider에서 목록을 가져옵니다.
4. **선정**: 분야별로 필터·정렬·중복 제거 후 날짜 순환으로 1건을 고릅니다(`src/pipeline/select.ts`).
5. **상세 조회**: 요약할 소개글(50자 이상)을 찾습니다. 없으면 다음 후보로 넘어가며 최대 3개까지 시도하고, 끝내 없으면 요약 없이 보냅니다.
6. **요약**: OpenRouter로 2~5문장, 400자 이내 존댓말 요약을 만듭니다. 출력 검증에 실패하면 주 모델로 한 번 더, 그다음 대체 모델로 시도합니다. 16:55까지 끝나지 않은 분야는 제외합니다.
7. **렌더**: Mattermost 마크다운 메시지를 만듭니다(`src/render/markdown.ts`).
8. **대기**: 17:00(KST)까지 기다립니다.
9. **발송**: 사용자 채널 Webhook으로 보냅니다.
10. **관리자 통지**: 오류나 후보 부족이 있으면 관리자 채널 Webhook으로 보냅니다.

## 데이터 소스

| 분야 | 소스 | 용도 | 파일 |
| --- | --- | --- | --- |
| 영화 | KOBIS 영화관입장권통합전산망 | 일별 박스오피스 | `src/providers/kobis.ts` |
| 영화 | KMDb 한국영화데이터베이스 | 줄거리(상세 조회 전용) | `src/providers/kmdb.ts` |
| 공연 | KOPIS 공연예술통합전산망 | 예매상황판·공연 상세 | `src/providers/kopis.ts` |
| 공연 | 서울 열린데이터광장 | 서울 문화행사 정보 | `src/providers/seoulCulture.ts` |
| 행사 | 한국관광공사 TourAPI | 축제·행사 검색·상세 | `src/providers/tourApi.ts` |
| 행사 | 한눈에보는문화정보 | 기간별 전시·행사 | `src/providers/cultureInfo.ts` |
| 서적 | 국립중앙도서관 | 사서추천도서 | `src/providers/nlRecommend.ts` |
| 서적 | 도서관 정보나루 | 대출 급상승 도서·상세 | `src/providers/data4library.ts` |

새 소스를 추가하려면 `Provider` 인터페이스(`src/core/types.ts`)를 구현하고 `src/providers/index.ts`에 한 줄 등록합니다.

## 요구 사항

- Node.js 22 이상
- Yarn 4 (`corepack enable`로 `package.json`의 `packageManager` 버전을 사용)

## 설치

```bash
corepack enable
yarn install
```

## 환경변수

`.env.example`을 복사해 `.env`를 만들고 값을 채웁니다. **`.env`는 커밋하지 않습니다**(`.gitignore`에 포함).

```bash
cp .env.example .env
```

| 변수 | 설명 |
| --- | --- |
| `DATA_GO_KR_SERVICE_KEY` | 공공데이터포털 서비스 키(TourAPI, 한눈에보는문화정보) |
| `KOBIS_API_KEY` | KOBIS 오픈API 키 |
| `KMDB_API_KEY` | KMDb 오픈API 키 |
| `KOPIS_SERVICE_KEY` | KOPIS 오픈API 서비스 키 |
| `SEOUL_OPENAPI_KEY` | 서울 열린데이터광장 인증키 |
| `NL_API_KEY` | 국립중앙도서관 오픈API 키 |
| `DATA4LIBRARY_AUTH_KEY` | 도서관 정보나루 인증키 |
| `OPENROUTER_API_KEY` | OpenRouter API 키 |
| `MATTERMOST_WEBHOOK_URL` | 추천 메시지를 보낼 채널의 Incoming Webhook URL |
| `MATTERMOST_ADMIN_WEBHOOK_URL` | 관리자 알림 채널의 Incoming Webhook URL |
| `HOLIDAY_API_URL` | 사내 Holiday API 기본 URL. `GET {URL}/api/holiday?target_date=YYYY-MM-DD`가 `{"isHoliday": boolean}`을 반환해야 합니다 |

위 변수는 모두 필수입니다. 하나라도 비어 있으면 실행하지 않습니다.

선택 변수:

| 변수 | 설명 |
| --- | --- |
| `LLM_MODEL` | 주 요약 모델 ID. 없으면 `src/config.ts`의 `LLM_MODEL` 상수를 씁니다 |
| `LLM_FALLBACK_MODEL` | 대체 요약 모델 ID. 없으면 `src/config.ts`의 `LLM_FALLBACK_MODEL` 상수를 씁니다 |

모델을 바꿀 때는 `src/config.ts`의 `MODEL_OPTIONS`에 JSON 모드·사고 모드 옵션도 함께 맞춥니다.

키 상태 점검:

```bash
yarn env:check
```

## 실행

```bash
yarn dev [옵션]
```

| 옵션 | 설명 |
| --- | --- |
| `--dry-run` | Webhook으로 보내지 않고 사용자·관리자 메시지를 콘솔에 출력 |
| `--no-wait` | 17:00까지 기다리지 않고 바로 발송 |
| `--skip-holiday` | 영업일 판정을 건너뜀 |
| `--use-fixtures` | 외부 API 대신 `fixtures/` 아래 저장된 응답을 사용 |
| `--now <ISO 시각>` | 지정한 시각을 현재로 보고 실행. 예: `--now 2026-11-24T16:30:00+09:00` |
| `--debug-select` | 분야별 후보 상위 5개, 선정 결과, 소개글 앞부분을 출력 |

예시:

```bash
# 실제 API로 수집하되 발송하지 않고 바로 결과 확인
yarn dev --dry-run --no-wait

# 네트워크 없이 저장된 응답으로 전체 흐름 확인
yarn dev --use-fixtures --dry-run --no-wait --skip-holiday
```

`--use-fixtures`를 써도 환경변수 확인은 먼저 수행합니다. 키가 없으면 아무 값이라도 채워 둡니다.

### 종료 코드

| 코드 | 의미 |
| --- | --- |
| `0` | 정상 발송, 휴일로 발송 생략, 또는 발송할 분야 없음 |
| `1` | 환경변수 누락, 발송 실패, 예상 밖 오류 |

## 개발

```bash
yarn typecheck   # 타입 검사
yarn test        # 단위 테스트 (vitest)
yarn build       # dist/로 컴파일
yarn start       # dist/index.js 실행
```

보조 스크립트:

| 명령 | 설명 |
| --- | --- |
| `yarn env:check` | 환경변수 값이 비었거나 임시 값인지 점검 |
| `yarn smoke` | 소스별 API를 1회 호출해 응답을 `fixtures/`에 저장. 키와 URL은 저장·출력 전에 가립니다 |
| `yarn tsx --env-file=.env scripts/compareModels.ts` | 주·대체 LLM 모델을 같은 원문으로 비교(응답 시간, JSON 준수, 검증 통과) |

로그와 관리자 메시지는 `src/core/redact.ts`를 거쳐 키·Webhook URL을 가립니다.

## 디렉터리 구조

```
src/
  index.ts        진입점. CLI 옵션과 환경변수를 읽어 run() 호출
  run.ts          전체 흐름 조립
  cli.ts          CLI 옵션 파싱
  config.ts       환경변수 목록, 발송 시각, 타임아웃, LLM 모델 설정
  core/           시계(KST), HTTP, XML 파싱, 오류, 영업일 판정, 로그 가림
  providers/      소스별 목록·상세 조회
  pipeline/       수집(collect), 선정(select), 상세 조회(detail)
  summarize/      OpenRouter 호출, 프롬프트, 출력 검증
  render/         Mattermost 메시지 렌더
  deliver/        Webhook 발송
  notify/         관리자 메시지와 오류 수집
scripts/          키 점검, smoke 호출, 모델 비교
tests/            vitest 단위 테스트
fixtures/         소스별 저장된 API 응답(테스트·--use-fixtures용)
k8s/              CronJob, Secret 예시
```

## 배포

Docker 이미지를 빌드하고 Kubernetes CronJob으로 실행합니다.

```bash
docker build -t <registry>/mattermost-agent-openplay:<tag> .
docker push <registry>/mattermost-agent-openplay:<tag>
```

키는 이미지에 넣지 않고 Kubernetes Secret으로 주입합니다. `k8s/secret.example.yaml`은 키 이름 예시일 뿐입니다.

```bash
kubectl create secret generic recommendation-chatbot --from-env-file=.env
kubectl apply -f k8s/cronjob.yaml
```

`k8s/cronjob.yaml`은 평일 16:30(KST)에 기동합니다. 수집·요약을 마친 뒤 17:00까지 기다렸다가 발송합니다.
주말은 CronJob 스케줄(`1-5`)이 거르고, 공휴일·사내 휴일은 Holiday API가 거릅니다.
배포 전에 `image` 값을 실제 레지스트리와 태그로 바꿉니다.
