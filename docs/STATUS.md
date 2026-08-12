# 진행 상황과 남은 일

최종 갱신: 2026-08-12

## 지금 어디까지 왔나

**Phase 1(모바일) 8개 태스크 중 3개 완료.** 이 프로젝트에서 가장 불확실했던 부분 — 앱이 종료된 상태에서 푸시 알림이 도착하고, 탭하면 해당 화면으로 이동하는지 — 를 실기기에서 검증했다. 남은 작업은 평범한 UI 구현이다.

| Task | 내용 | 상태 |
|---|---|---|
| 1 | 프로젝트 생성, EAS 등록, Firebase, Development Build | ✅ 완료 |
| 2 | 푸시 권한·채널·토큰 발급, 실기기 수신 검증 | ✅ 완료 |
| 3 | 포그라운드 핸들러, 알림 탭 → 상세 라우팅 | ✅ 완료 |
| 4 | NativeWind + react-native-reusables | ⬜ 다음 |
| 5 | 타입, mock 데이터, API 계층 | ⬜ |
| 6 | 빌드 목록 화면 | ⬜ |
| 7 | 빌드 상세 화면 | ⬜ |
| 8 | README, 환경변수 예시 | ⬜ (일부 선행 완료) |

Phase 2(백엔드)는 착수 전이다.

### 검증된 것

- Development build가 폰에 설치되고 Metro 개발 서버에 연결된다
- 코드 수정이 폰에 즉시 반영된다 (핫 리로드)
- 푸시 권한 요청 → `ExponentPushToken[...]` 발급
- **앱을 완전히 종료한 상태에서 알림이 폰 알림창에 도착한다**
- 앱이 포그라운드일 때도 알림 배너가 표시된다
- **알림을 탭하면 콜드 스타트로 상세 화면이 바로 열리고, `#`을 포함한 buildId가 온전히 전달된다**

### 현재 파일 구조

```
mobile/src/
  app/
    _layout.tsx      알림 핸들러 + 탭 라우팅 + Stack
    index.tsx        토큰 표시용 임시 화면 (Task 6에서 목록 화면으로 교체)
    build/[id].tsx   라우팅 검증용 임시 화면 (Task 7에서 실제 상세로 교체)
  lib/
    push.ts          권한, builds 채널, 토큰 발급
  global.css         Task 4에서 Tailwind 지시자 추가
```

## 다음 할 일

### Task 4~7

계획서에 코드가 전부 들어 있다. 순서대로 진행하면 된다.

주의할 지점:

- **Task 4 착수 전에 `expo-tailwind-setup` 스킬을 확인해야 한다.** 이 저장소의 스킬 설명이 "Tailwind CSS v4 + react-native-css + NativeWind v5"를 가리키는데, 계획서는 NativeWind v4 기준으로 작성됐다. 설정 파일 형식이 다를 수 있다
- `tailwind.config.js`의 `content`는 `./src/**`를 가리켜야 한다. 틀리면 클래스가 조용히 무시된다
- Task 4 이후에는 `npx expo start --dev-client --clear`로 캐시를 비워야 설정이 반영된다
- Task 4~7에서 추가하는 패키지는 모두 순수 JS다. **네이티브 재빌드가 필요 없다**

### Phase 2 — 백엔드

`docs/superpowers/specs/`의 API 계약대로 구현한다. 구현 언어는 미결정.

```
POST /api/devices          앱 → 서버
GET  /api/builds?limit=30  앱 → 서버
GET  /api/builds/:id       앱 → 서버 (콜드 스타트 대응)
POST /api/builds           Jenkins → 서버 (X-Secret 인증)
```

앱 쪽에서 바꿀 것은 `USE_MOCK` 한 줄과 `EXPO_PUBLIC_API_URL` 뿐이다.

발송 경로는 이미 검증됐다. Expo Push API에 다음 형태로 POST하면 된다.

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{"to":"ExponentPushToken[...]","title":"✅ my-service #42",
       "body":"main · 2m 13s","data":{"buildId":"my-service#42"},
       "channelId":"builds","priority":"high"}'
```

직접 FCM으로 발송하는 방식도 선택 가능하다. 앱 쪽 변경은 `getExpoPushTokenAsync()` → `getDevicePushTokenAsync()` 한 줄이고, 서버는 `firebase-admin`을 쓴다. Android는 어느 쪽이든 Firebase 프로젝트가 필요하므로 설정 비용 차이는 크지 않다.

## 진행 중 확정한 결정

| 결정 | 이유 |
|---|---|
| Expo Go 대신 development build | Expo Go는 SDK 53부터 Android 원격 푸시를 지원하지 않는다 |
| 패키지 매니저 npm 고정 | pnpm 심볼릭 링크가 Metro 네이티브 모듈 해석에서 문제를 일으킨 이력. 학습 중 원인 구분이 어려워지는 비용이 크다 |
| 로컬 저장소 없음 (SQLite/MMKV/AsyncStorage) | 오프라인에서 최신 빌드 상태를 아는 것은 원리적으로 불가능. 토큰은 매 실행 재발급해 서버에 upsert하므로 저장할 것이 없다. 오히려 "등록됨" 플래그를 캐싱하면 OS가 토큰을 갱신했을 때 알림이 조용히 끊긴다 |
| 전역 상태관리 없음 | 서버 상태는 TanStack Query, 나머지는 `useState` |
| 자동화 테스트 없음 | 이 규모에서 인프라 구축 비용이 이익을 넘는다. mock 모드가 계약 검증 역할을 하고, 푸시는 실기기 수동 검증이 유일한 방법이다 |
| 경로 별칭 `@/` | SDK 57 템플릿 기본값(`./src/*`). 별도 설정 불필요 |
| `notification/mobile/` 하위 구조 | Phase 2 백엔드가 `server/`로 들어올 자리. 폴더명을 `app`으로 하면 Expo Router의 `app/`과 겹쳐 `app/app/`이 된다 |

## 삽질 기록

같은 함정을 다시 밟지 않기 위해 남긴다.

**EAS 빌드가 `EPERM ... symlink`로 실패**
`eas init`이 `.claude/skills/*`를 `.agents/skills/*`로 가리키는 심볼릭 링크로 설치한다. Windows에서 심링크 생성은 관리자 권한이 필요해 프로젝트 복제 단계에서 죽는다. 저장소 루트에 `.easignore`를 두고 제외했다.
EAS는 업로드 범위를 `eas.json` 위치가 아니라 **git 저장소 루트**로 잡는다(모노레포 지원). 그래서 `.easignore`가 루트에 있어야 한다.

**토큰은 나오는데 알림이 안 오는 상태**
`eas credentials`에서 `Push Notifications (FCM V1): None assigned yet`이었다. Expo Push를 쓰더라도 Android는 내 Firebase 서비스 계정 키를 EAS에 업로드해야 한다. 이걸 Task 1 초반에 확인하지 않아 빌드를 세 번 돌렸다.

**`Connecting to the development server...`에서 멈춤**
폰의 Tailscale이 46일째 오프라인이었다. 양쪽 모두 연결돼 있어야 한다.
그리고 `ipconfig`의 `vEthernet (...)` 주소(`172.28.96.1` 등)는 Hyper-V/WSL 가상 네트워크라 접속 대상이 아니다. 실제 주소는 Wi-Fi 어댑터 또는 Tailscale의 `100.x`다.

**`npm run reset-project`를 쓰면 안 된다**
`src/`와 `scripts/`를 통째로 `example/`로 옮긴다. `src/global.css`까지 사라져 NativeWind 설정이 깨진다. 필요한 파일만 직접 지웠다.

**`shouldShowAlert`는 SDK 57에 없다**
`NotificationBehavior`는 `shouldPlaySound`, `shouldSetBadge`, `shouldShowBanner`, `shouldShowList`, `priority`만 받는다. 구버전 필드를 넣으면 타입 에러다.

**`router.push`에 문자열 경로를 조립하지 않는다**
`buildId`가 `my-service#42` 형태라 `` router.push(`/build/${buildId}`) ``는 `#` 뒤가 URL 프래그먼트로 해석되어 잘린다. 객체 형태로 넘기면 Expo Router가 인코딩을 처리한다.

```ts
router.push({ pathname: '/build/[id]', params: { id: buildId } })
```

`pathname`에는 실제 값이 아니라 **라우트 패턴 그대로**(`/build/[id]`) 넣는다.

**네이티브 모듈은 빌드 전에 모두 설치해야 한다**
`expo-notifications`, `expo-clipboard`는 APK에 컴파일돼 들어가므로 나중에 추가하면 재빌드가 필요하다. JS 코드 수정과 순수 JS 패키지 추가는 재빌드가 필요 없다.

## 참고 문서

| 문서 | 내용 |
|---|---|
| `docs/superpowers/specs/2026-08-11-jenkins-build-notifier-design.md` | 설계, API 계약, 채택하지 않은 선택지와 이유 |
| `docs/superpowers/plans/2026-08-11-jenkins-notifier-phase1-mobile.md` | Task 1~8 구현 계획. 코드 전문과 명령어 레퍼런스 포함 |
| `docs/ENVIRONMENT.md` | 다른 환경에서 재현하는 방법 |
| `docs/AUTH.md` | 인증 설계 (구글 OAuth + Redis 세션). **현재 Phase 1·2 범위 밖이다** — 아래 참조 |

## 미해결 범위 문제

`docs/AUTH.md`는 구글 OAuth 로그인과 기기 단위 세션을 설계한 문서다. 그런데 현재 설계 문서(`specs/`)는 **개인 서버 + 사용자 1명**을 전제로 하며 인증이 없다. `POST /api/devices`도 사용자 개념 없이 푸시 토큰만 upsert한다.

둘은 양립하지 않는다. 인증을 도입하면 API 계약이 바뀐다.

- `POST /api/devices`가 세션에서 사용자를 식별해야 한다
- 빌드 이력이 사용자별로 분리되어야 한다
- 앱에 로그인 화면과 라우트 게이팅이 추가된다

Phase 2 착수 전에 어느 쪽으로 갈지 정해야 한다. 개인용으로 유지하면 `AUTH.md`는 별도 프로젝트를 위한 참고 문서로 남고, 다중 사용자로 가면 `specs/`의 API 계약을 먼저 개정해야 한다.
