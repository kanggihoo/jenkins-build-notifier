# Jenkins 빌드 알림 앱 — 설계

작성일: 2026-08-11

## 목적

개인 서버의 Jenkins에서 빌드가 끝나면 핸드폰으로 푸시 알림을 받고, 앱에서 최근 빌드 이력을 확인한다.

부차적 목적이지만 실질적으로 중요한 것: React Native / Expo / 푸시 알림 파이프라인을 직접 만들어보며 학습한다. 따라서 "Jenkins 플러그인으로 텔레그램에 웹훅 쏘기" 같은 최단 경로는 목적에 부합하지 않아 채택하지 않는다.

## 전체 구조

```
[개인 서버]
  Jenkins ──빌드 완료 시 Post-build curl──> 백엔드
                                             ├─ SQLite에 빌드 이력 저장
                                             └─ Expo Push API 호출
                                                      │
                                              [Expo] → [FCM] → [Google Play Services]
                                                                        │
  RN 앱 ──HTTPS로 이력 조회──────────────────────────────────────> 폰 알림창
```

서버는 도메인과 HTTPS 인증서가 이미 준비되어 있다.

알림을 표시하는 주체는 앱이 아니라 OS다. 앱이 종료된 상태에서도 알림이 도착하며, 앱은 알림을 탭했을 때 실행된다.

### 백엔드를 두는 이유

Jenkins가 자체 REST API(`/api/json`)를 제공하므로 앱이 Jenkins를 직접 조회하는 구성도 이론적으로 가능하다. 채택하지 않은 이유:

- 앱 바이너리에 심은 Jenkins 자격증명은 유출된 것으로 간주해야 한다. 개인 서버 전체가 위험해진다.
- 푸시 토큰을 저장할 주체가 어차피 필요하다.

따라서 Jenkins를 외부에 노출하지 않고, 얇은 백엔드 한 겹을 경유한다.

## 단계 분리

푸시 알림은 이 프로젝트에서 가장 불확실한 부분이고, Expo는 백엔드 없이 이를 검증할 수단(`expo.dev/notifications` 웹 도구)을 제공한다. 그러므로 모바일을 먼저 완성하고 백엔드를 나중에 붙인다.

앱은 아래 API 계약을 전제로 작성하되 데이터 접근을 `lib/api.ts` 한 파일 뒤로 숨긴다. `USE_MOCK` 플래그를 끄고 base URL만 주입하면 Phase 2에서 그대로 연결된다.

### Phase 1 — 모바일 (현재 범위)

- Expo 앱 생성, EAS 등록, Development Build 설치
- 푸시 권한 요청 → Expo 푸시 토큰 발급 → 화면에 표시(복사 가능)
- 실기기 푸시 수신 검증
- 빌드 이력 목록 화면
- 빌드 상세 화면
- 알림 탭 시 해당 빌드 상세로 이동
- 데이터는 mock JSON

완료 기준: 앱이 **종료된 상태**에서 `expo.dev/notifications`로 쏜 알림이 알림창에 도착하고, 탭하면 해당 빌드 상세 화면이 열린다.

### Phase 2 — 백엔드 (이후)

아래 계약대로 구현하고 Jenkins Post-build에 curl 한 줄을 추가한다. 구현 언어는 Phase 2 착수 시점에 결정한다.

## API 계약

Phase 1의 산출물 중 하나. 앱과 백엔드가 이 계약을 공유한다.

```
POST /api/devices          앱 → 서버        { expoPushToken: string }
GET  /api/builds?limit=30  앱 → 서버        { builds: Build[] }
GET  /api/builds/:id       앱 → 서버        Build
POST /api/builds           Jenkins → 서버   Build (X-Secret 헤더 인증, 앱은 사용 안 함)
```

`POST /api/devices`는 `expoPushToken`을 기본키로 **upsert**한다. 앱은 실행할 때마다 무조건 호출하므로 멱등해야 한다.

`GET /api/builds/:id`가 필요한 이유: 알림을 탭해 앱이 콜드 스타트하면 상세 화면이 목록보다 먼저 열린다. 이때 목록 캐시가 비어 있으므로 단건 조회가 없으면 화면을 그릴 수 없다. `id`는 `#`를 포함하므로 URL 인코딩해서 요청한다.

### Build

```ts
type BuildStatus = "SUCCESS" | "FAILURE" | "ABORTED" | "UNSTABLE"

type Build = {
  id: string           // "my-service#42"
  job: string          // "my-service"
  number: number       // 42
  status: BuildStatus
  branch: string       // "main"
  commit: string       // short sha
  message: string      // 커밋 메시지
  durationMs: number
  finishedAt: string   // ISO8601
  url: string          // Jenkins 빌드 페이지 링크
}
```

`GET /api/builds`는 `finishedAt` 내림차순으로 반환한다.

### 푸시 페이로드

```ts
{
  to: expoPushToken,
  title: "✅ my-service #42",   // 실패 시 "❌"
  body: "main · 2m 13s",
  data: { buildId: "my-service#42" },
  priority: "high",             // 필수 — 아래 참조
  channelId: "builds"
}
```

`data.buildId`로 알림 탭 시 상세 화면으로 라우팅한다.

## 알림 동작 요구사항

푸시가 "그냥 동작할 것"이라고 가정하면 안 되는 부분들. 셋 다 빠지면 알림이 조용히 실패한다.

**알림 채널** — Android 8.0부터 모든 알림은 채널에 속해야 한다. 채널이 없으면 알림이 무시되거나 소리·진동 없이 상태바에만 들어간다. 앱 첫 실행 시 `setNotificationChannelAsync`로 `builds` 채널을 중요도 `MAX`로 생성한다. 중요도가 낮으면 화면 상단 팝업(heads-up)으로 뜨지 않는다.

**우선순위** — Doze 모드에서 일반 우선순위 메시지는 최대 수십 분 지연된다. 빌드 알림은 지연되면 가치가 없으므로 발송 시 `priority: "high"`를 지정한다.

**포그라운드 핸들러** — 앱이 화면에 떠 있을 때 알림은 기본적으로 표시되지 않는다. 이는 정상 동작이지만 개발 중 "알림이 안 온다"는 오진을 유발한다. `setNotificationHandler`로 포그라운드에서도 표시하도록 설정한다.

## 기술 스택 (Phase 1)

| 역할 | 선택 |
|---|---|
| 패키지 매니저 | **npm** |
| 언어 | TypeScript |
| 프레임워크 | Expo |
| 라우팅 | Expo Router (파일 기반) |
| 스타일 | NativeWind (Tailwind 문법) |
| UI 컴포넌트 | react-native-reusables (shadcn RN 포팅, 컴포넌트를 프로젝트로 복사) |
| 서버 상태 | TanStack Query |
| 로컬 저장 | **없음** |
| 푸시 | expo-notifications, expo-device, expo-constants |
| 날짜 | date-fns |
| 아이콘 | @expo/vector-icons |

### 패키지 매니저를 npm으로 고정하는 이유

RN에서 가장 잘 깨지는 지점은 Metro 번들러의 네이티브 모듈 해석이다. pnpm의 심볼릭 링크 구조는 여기서 문제를 일으킨 이력이 있고, `node-linker=hoisted`로 회피 가능하지만 설정을 하나 더 알아야 한다. 학습 중에는 "내 코드 문제인가 번들러 설정 문제인가"를 구분 못 하는 상황이 가장 비싸다. Expo 문서·에러 메시지·커뮤니티 답변이 모두 npm 기준이므로 검색이 그대로 통한다. 설치 속도 차이는 프로젝트 전체에서 수 분 수준이다.

### NativeWind 채택과 그 리스크

NativeWind는 소수 인원이 유지하는 프로젝트이며 회사의 후원을 받지 않는다. 이는 실재하는 리스크다.

채택하는 이유는 "RN에서 Tailwind 문법"이라는 카테고리에 사실상 대안이 없고, 락인이 얕기 때문이다. NativeWind는 빌드 타임에 Tailwind 클래스를 RN 기본 `StyleSheet` 객체로 변환할 뿐 런타임 추상화 계층을 만들지 않는다. 프로젝트가 중단되어도 결과물은 평범한 RN 스타일이므로 이탈 비용이 제한적이다.

### 채택하지 않은 것

- **로컬 DB (expo-sqlite)**: 오프라인에서 최신 빌드 상태를 아는 것은 원리적으로 불가능하므로 로컬 캐시에 의미가 없다.
- **AsyncStorage / MMKV**: 저장할 데이터가 없다. Expo 푸시 토큰은 앱 실행 시마다 `getExpoPushTokenAsync()`로 다시 얻을 수 있으므로, "등록 완료" 플래그를 캐싱하는 대신 매 실행마다 `POST /api/devices`를 호출한다. 서버가 upsert하므로 멱등하다. 오히려 플래그를 캐싱하면 OS가 토큰을 갱신했을 때 재등록을 건너뛰어 알림이 조용히 끊기는 버그가 생긴다.
- **전역 상태관리 (Zustand 등)**: 서버 상태는 TanStack Query가 보유하고, 나머지는 `useState`로 충분하다.

## 컴포넌트 경계

| 단위 | 책임 | 의존 |
|---|---|---|
| `lib/api.ts` | 빌드 데이터 조회, 디바이스 등록. mock/실서버 분기를 여기서만 처리 | 없음 (mock 모드에서) |
| `lib/push.ts` | 권한 요청, 채널 생성, 토큰 발급, 알림 수신·탭 리스너 등록 | expo-notifications |
| `app/index.tsx` | 빌드 목록 화면 | api, UI 컴포넌트 |
| `app/build/[id].tsx` | 빌드 상세 화면 | api, UI 컴포넌트 |
| `components/BuildCard.tsx` | 목록 한 줄 렌더링. 순수 표현 컴포넌트 | 없음 |

`lib/api.ts`의 함수 시그니처는 mock/실서버 양쪽에서 동일하다. 화면은 데이터 출처를 알지 못한다.

## 에러 처리

| 상황 | 처리 |
|---|---|
| 푸시 권한 거부 | 목록 화면 상단에 배너 표시. 앱 기능 자체는 계속 동작 |
| 에뮬레이터/시뮬레이터 실행 | `expo-device`로 감지해 안내 표시. 토큰 발급 시도하지 않음 |
| 토큰 발급 실패 | 화면에 에러 표시. 재시도 버튼 제공 |
| 디바이스 등록 실패 | 조용히 무시하고 다음 실행에 재시도. 앱 사용을 막지 않는다 |
| 목록 조회 실패 | TanStack Query의 error 상태로 에러 화면 + 재시도 |
| 네트워크 없음 | 조회 실패와 동일하게 처리 (로컬 캐시 없음) |

## 테스트

이 규모에서 테스트 인프라를 구축하는 비용이 이익을 넘는다. 다음으로 대체한다.

- `lib/api.ts`의 mock 모드 자체가 개발 중 계약 검증 역할을 한다.
- 푸시 파이프라인은 실기기 + `expo.dev/notifications`로 수동 검증한다. 자동화 불가능한 영역이다.

Phase 2에서 백엔드를 붙일 때 `POST /api/builds` 처리 로직은 유닛 테스트 대상으로 재검토한다.

## 환경 제약

**Expo Go로는 개발할 수 없다.** Expo Go에서 원격 푸시 알림 지원이 제거되었다 (SDK 53, Android). Development Build를 만들어 실기기에 설치해야 한다. 한 번 설치하면 이후 코드 수정은 Expo Go처럼 즉시 반영된다.

**푸시 토큰 발급에 EAS projectId가 필요하다.** `eas init`으로 Expo 계정에 프로젝트를 등록하는 절차가 선행되어야 한다. 무료다.

**삼성 기기의 배터리 최적화가 알림을 차단할 수 있다.** 삼성은 자주 사용하지 않는 앱을 자동으로 "잠자는 앱"으로 분류한다. 개발 빌드로 설치한 앱은 예외 목록에 없으므로 며칠 방치하면 알림이 끊긴다. `설정 > 배터리 > 백그라운드 사용 제한`에서 수동으로 제외해야 한다. 코드로 해결되지 않는다.

**강제 종료 시 FCM 전달이 차단된다.** 설정에서 "강제 중지"를 누르면 앱을 다시 실행할 때까지 푸시가 전달되지 않는다. Android 정책이며 우회 방법이 없다. 최근 앱 목록에서 스와이프로 닫는 것은 해당하지 않는다.
