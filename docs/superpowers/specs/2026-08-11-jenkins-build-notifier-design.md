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
                                                 [Expo 서버]
                                                      │
                                                      ▼
  RN 앱 ──HTTPS로 이력 조회────────────────────────> 폰 알림
```

서버는 도메인과 HTTPS 인증서가 이미 준비되어 있다.

### 백엔드를 두는 이유

Jenkins가 자체 REST API(`/api/json`)를 제공하므로 앱이 Jenkins를 직접 조회하는 구성도 이론적으로 가능하다. 채택하지 않은 이유:

- 앱 바이너리에 심은 Jenkins 자격증명은 유출된 것으로 간주해야 한다. 개인 서버 전체가 위험해진다.
- 푸시 토큰을 저장할 주체가 어차피 필요하다.

따라서 Jenkins를 외부에 노출하지 않고, 얇은 백엔드 한 겹을 경유한다.

## 단계 분리

푸시 알림은 이 프로젝트에서 가장 불확실한 부분이고, Expo는 백엔드 없이 이를 검증할 수단(`expo.dev/notifications` 웹 도구)을 제공한다. 그러므로 모바일을 먼저 완성하고 백엔드를 나중에 붙인다.

앱은 아래 API 계약을 전제로 작성하되 데이터 접근을 `api.ts` 한 파일 뒤로 숨긴다. `USE_MOCK` 플래그를 끄고 base URL만 주입하면 Phase 2에서 그대로 연결된다.

### Phase 1 — 모바일 (현재 범위)

- Expo 앱 생성, Development Build 설치
- 푸시 권한 요청 → Expo 푸시 토큰 발급 → 화면에 표시(복사 가능)
- 빌드 이력 목록 화면
- 빌드 상세 화면
- 알림 탭 시 해당 빌드 상세로 이동
- 데이터는 mock JSON

완료 기준: 실기기에서 `expo.dev/notifications`로 쏜 알림이 도착하고, 탭하면 해당 빌드 상세 화면이 열린다.

### Phase 2 — 백엔드 (이후)

아래 계약대로 구현하고 Jenkins Post-build에 curl 한 줄을 추가한다. 구현 언어는 Phase 2 착수 시점에 결정한다.

## API 계약

Phase 1의 산출물 중 하나. 앱과 백엔드가 이 계약을 공유한다.

```
POST /api/devices          앱 → 서버        { expoPushToken: string }
GET  /api/builds?limit=30  앱 → 서버        { builds: Build[] }
POST /api/builds           Jenkins → 서버   Build (X-Secret 헤더 인증, 앱은 사용 안 함)
```

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
  data: { buildId: "my-service#42" }
}
```

`data.buildId`로 알림 탭 시 상세 화면으로 라우팅한다.

## 기술 스택 (Phase 1)

| 역할 | 선택 |
|---|---|
| 언어 | TypeScript |
| 프레임워크 | Expo |
| 라우팅 | Expo Router (파일 기반) |
| 스타일 | NativeWind (Tailwind 문법) |
| UI 컴포넌트 | react-native-reusables (shadcn RN 포팅, 컴포넌트를 프로젝트로 복사) |
| 서버 상태 | TanStack Query |
| 로컬 저장 | AsyncStorage |
| 푸시 | expo-notifications, expo-device, expo-constants |
| 날짜 | date-fns |
| 아이콘 | @expo/vector-icons |

### 채택하지 않은 것

- **로컬 DB (expo-sqlite)**: 오프라인에서 최신 빌드 상태를 아는 것은 불가능하므로 로컬 캐시 DB에 의미가 없다. 필요한 로컬 저장은 "푸시 토큰을 서버에 등록했는가" 불리언 하나뿐이며 AsyncStorage로 충분하다.
- **전역 상태관리 (Zustand 등)**: 서버 상태는 TanStack Query가 보유하고, 나머지는 `useState`로 충분하다.

## 컴포넌트 경계

| 단위 | 책임 | 의존 |
|---|---|---|
| `lib/api.ts` | 빌드 데이터 조회, 디바이스 등록. mock/실서버 분기를 여기서만 처리 | 없음 (mock 모드에서) |
| `lib/push.ts` | 권한 요청, 토큰 발급, 알림 수신·탭 리스너 등록 | expo-notifications |
| `app/index.tsx` | 빌드 목록 화면 | api, UI 컴포넌트 |
| `app/build/[id].tsx` | 빌드 상세 화면 | api, UI 컴포넌트 |
| `components/BuildCard.tsx` | 목록 한 줄 렌더링. 순수 표현 컴포넌트 | 없음 |

`api.ts`의 함수 시그니처는 mock/실서버 양쪽에서 동일하다. 화면은 데이터 출처를 알지 못한다.

## 에러 처리

| 상황 | 처리 |
|---|---|
| 푸시 권한 거부 | 목록 화면 상단에 배너 표시. 앱 기능 자체는 계속 동작 |
| 에뮬레이터/시뮬레이터 실행 | `expo-device`로 감지해 안내 메시지. 푸시 토큰 발급 시도하지 않음 |
| 토큰 발급 실패 | 화면에 에러 표시. 재시도 버튼 제공 |
| 목록 조회 실패 | TanStack Query의 error 상태로 에러 화면 + 재시도 |
| 네트워크 없음 | 조회 실패와 동일하게 처리 (로컬 캐시 없음) |

## 테스트

이 규모에서 테스트 인프라를 구축하는 비용이 이익을 넘는다. 다음으로 대체한다.

- `lib/api.ts`의 mock 모드 자체가 개발 중 계약 검증 역할을 한다.
- 푸시 파이프라인은 실기기 + `expo.dev/notifications`로 수동 검증한다. 자동화 불가능한 영역이다.

Phase 2에서 백엔드를 붙일 때 `POST /api/builds` 처리 로직은 유닛 테스트 대상으로 재검토한다.

## 주의사항

**Development Build를 프로젝트 초반에 만들어야 한다.** Expo Go에서는 원격 푸시 알림이 동작하지 않는다 (SDK 53에서 Android 지원이 제거됨). 앱을 완성한 뒤 푸시가 오지 않는 원인을 찾는 상황을 피하기 위해, "빈 앱에서 푸시 토큰 발급 + 수신 확인"을 첫 작업으로 둔다.

```bash
eas init                                          # Expo 프로젝트 등록 (projectId 발급, 무료)
eas build --profile development --platform android
```

푸시 토큰 발급 시 `expo-constants`로 읽는 EAS projectId가 필요하므로 `eas init`이 선행되어야 한다.
