# Jenkins 빌드 알림 앱 — Phase 1 (모바일) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jenkins 빌드 결과를 푸시 알림으로 받고 이력을 조회하는 React Native 앱을, 백엔드 없이 mock 데이터로 완성한다.

**Architecture:** Expo Router 기반 2화면 앱. 모든 데이터 접근은 `src/lib/api.ts` 뒤에 숨겨 `USE_MOCK` 플래그 하나로 mock/실서버를 전환한다. 푸시 수신 검증을 최우선으로 배치해, 가장 불확실한 부분을 UI 작업 전에 끝낸다.

**Tech Stack:** TypeScript, **Expo SDK 57**, Expo Router, NativeWind, react-native-reusables, TanStack Query, expo-notifications, date-fns

## Global Constraints

- **패키지 매니저는 npm 고정.** pnpm/yarn/bun 사용 금지. Metro의 네이티브 모듈 해석 문제를 회피하기 위한 결정이다.
- **Expo 패키지 설치는 `npm install`이 아니라 `npx expo install`을 쓴다.** Expo SDK 버전에 맞는 호환 버전을 골라준다. Expo가 관리하지 않는 순수 JS 패키지(`@tanstack/react-query`, `date-fns`)만 `npm install`을 쓴다.
- **Expo Go로 테스트하지 않는다.** 원격 푸시가 동작하지 않는다. 반드시 Development Build를 실기기에 설치해 검증한다.
- **에뮬레이터로 푸시를 테스트하지 않는다.** 실기기가 필요하다.
- **로컬 저장소(AsyncStorage/MMKV/SQLite)를 도입하지 않는다.** 앱 실행마다 토큰을 재발급해 서버에 재등록한다.
- **전역 상태관리 라이브러리를 도입하지 않는다.** 서버 상태는 TanStack Query, 나머지는 `useState`.
- **경로 별칭은 `@/`를 쓴다.** 템플릿의 `tsconfig.json`에 `"@/*": ["./src/*"]`가 이미 설정되어 있다. 별도 설정이 필요 없다. react-native-reusables가 `~/`를 쓰는 컴포넌트를 생성하면 `@/`로 고친다.
- **소스는 모두 `src/` 아래에 있다.** 라우트는 `app/`이 아니라 **`src/app/`**이다. SDK 57 템플릿의 구조다.
- **자동화 테스트를 작성하지 않는다.** 스펙의 결정이다 (`## 테스트` 절 참조). 각 태스크는 테스트 코드 대신 **명시적 수동 검증 단계**로 끝난다. 검증 단계를 건너뛰지 말 것.

---

## 명령어 레퍼런스

이 계획서에 나오는 명령어가 각각 무엇을 하는지 정리한다. 무엇이 바뀌는지 알고 치면 문제가 생겼을 때 원인을 좁히기 쉽다.

### npm과 npx의 차이

| 명령 | 하는 일 |
|---|---|
| `npm install <패키지>` | 패키지를 내려받아 `node_modules/`에 넣고 `package.json`에 기록한다 |
| `npm install -g <패키지>` | 전역 설치. 어느 폴더에서든 명령어로 쓸 수 있게 된다 (`eas-cli`가 이 경우) |
| `npx <명령>` | **설치 없이 1회성 실행.** 로컬 `node_modules/.bin`에서 찾고, 없으면 레지스트리에서 임시로 받아 실행한 뒤 버린다 |
| `npm run <스크립트>` | `package.json`의 `scripts`에 정의된 것을 실행한다 |

`npx`를 쓰는 이유는 `create-expo-app`처럼 **한 번만 필요한 도구를 전역에 설치해두지 않기 위해서**다. 버전 고정 효과도 있다 — `@latest`를 붙이면 매번 최신을 받는다.

### `npm install`과 `npx expo install`의 차이

| 명령 | 언제 |
|---|---|
| `npx expo install <패키지>` | **Expo가 관리하는 패키지.** 현재 SDK 버전(57)과 호환되는 버전을 골라 설치한다 |
| `npm install <패키지>` | **Expo와 무관한 순수 JS 패키지** (`date-fns`, `@tanstack/react-query`) |

`expo-notifications` 같은 패키지를 `npm install`로 깔면 SDK와 버전이 어긋나 런타임에 깨질 수 있다. Expo 생태계 패키지는 반드시 `npx expo install`을 쓴다.

### 개발 서버 관련

| 명령 | 하는 일 |
|---|---|
| `npx expo start` | **Metro 번들러(개발 서버)를 8081 포트에 띄운다.** 폰이 여기 접속해 JS 코드를 실시간으로 받아간다. 서버는 켜둔 채로 개발한다 |
| `npx expo start --dev-client` | 위와 같되 Expo Go가 아니라 **직접 만든 development build로 연결**하라는 뜻 |
| `npx expo start --clear` | Metro 캐시를 비우고 시작. **설정 파일(`metro.config.js`, `babel.config.js`, `tailwind.config.js`)을 바꾼 뒤에는 반드시 필요하다.** 캐시가 남아 있으면 변경이 반영되지 않아 "설정이 틀렸나?" 하고 헤매게 된다 |
| `npm run reset-project` | 템플릿이 만들어둔 예제 화면을 `app-example/`로 치우고 빈 화면만 남긴다. 템플릿 전용 스크립트다 |

### EAS(Expo Application Services) 관련

EAS는 Expo가 운영하는 **클라우드 빌드 서비스**다. 내 PC에 Android Studio나 JDK를 설치하지 않고 APK를 만들 수 있다.

| 명령 | 하는 일 | 남는 것 |
|---|---|---|
| `eas login` | Expo 계정 로그인 | 로그인 세션 |
| `eas init` | Expo 서버에 프로젝트를 등록해 고유 ID를 발급받는다 | `app.json`의 `extra.eas.projectId` |
| `eas build:configure` | 빌드 설정 파일 생성 | `eas.json` |
| `eas build --profile development --platform android` | **클라우드에 소스를 올려 APK를 만든다.** 15~20분 | 다운로드 링크와 QR |
| `eas build:inspect -p android -s archive -o <폴더>` | 아래 참조 | 지정한 폴더에 아카이브 사본 |

**`projectId`가 왜 필요한가:** 푸시 토큰은 "이 앱의 이 설치본"을 가리키는 주소다. Expo 서버가 그 주소를 발급하려면 어떤 프로젝트인지 알아야 하므로, `eas init` 없이는 토큰을 받을 수 없다.

**`eas build:inspect`가 하는 일:** 실제 빌드를 하지 않고, **클라우드에 업로드될 파일 묶음만 로컬에 그대로 뽑아준다.** `-s archive`가 "업로드 직전 단계"라는 뜻이고 `-o`는 출력 폴더다.

용도는 하나다 — **20분짜리 빌드를 날리기 전에 업로드 단계가 통과할지 미리 확인하는 것.** 이 프로젝트에서는 심볼릭 링크 때문에 업로드가 실패한 적이 있어서(Task 1 Step 5-1), 수정이 먹혔는지 검증하는 데 썼다. 출력 폴더를 열어 `.agents/`, `.claude/`, `docs/`가 비어 있고 `node_modules`가 없으면 정상이다.

빌드가 업로드 단계에서 실패할 때만 쓰면 되고, 평소에는 쓸 일이 없다.

### 검증 명령

| 명령 | 하는 일 |
|---|---|
| `npx tsc --noEmit` | **타입 검사만 하고 JS 파일은 만들지 않는다.** `--noEmit`이 "출력하지 마라"는 뜻이다. 에러 없이 끝나면 타입이 맞는 것이다 |
| `git status` | 아직 커밋되지 않은 변경 목록 |
| `git add -A` / `git commit -m "..."` | 변경을 스테이지에 올리고 기록 |

---

## 디렉터리 배치

git 저장소는 `notification/`이며 이미 존재한다. Phase 2에서 백엔드가 `server/`로 들어올 자리를 남기기 위해 모바일 프로젝트를 `mobile/` 하위에 둔다.

```
notification/              ← git 저장소 루트 (이미 존재)
├── docs/                  ← 스펙, 계획서 (이미 존재)
├── mobile/                ← Expo 프로젝트 (Task 1에서 생성)
└── server/                ← Phase 2에서 생성. 지금은 만들지 않는다
```

Expo 프로젝트 폴더 이름은 `app`이 아니라 **`mobile`**이다. Expo Router가 `app/`을 라우트 디렉터리로 사용하므로 `app/app/`이 되어 혼동을 일으킨다.

## 파일 구조

아래는 모두 `notification/mobile/` 기준 상대 경로다.

```
src/
  app/
    _layout.tsx        Provider 구성, 알림 핸들러/리스너 등록, 전역 CSS 로드
    index.tsx          빌드 목록 화면
    build/[id].tsx     빌드 상세 화면
  components/
    StatusBadge.tsx    빌드 상태 배지 (순수 표현)
    BuildCard.tsx      목록 한 줄 (순수 표현)
    ui/                react-native-reusables가 복사해 넣는 컴포넌트
  lib/
    types.ts           Build, BuildStatus 타입
    mock.ts            mock 빌드 데이터
    api.ts             데이터 접근 단일 창구 (mock/실서버 분기)
    push.ts            권한, 채널, 토큰 발급
    format.ts          시간·소요시간 포맷
  global.css           Tailwind 지시자 (템플릿이 이미 생성해 둔 파일을 수정)
tailwind.config.js
metro.config.js
babel.config.js
```

`@/` 별칭은 `src/`를 가리킨다. 즉 `@/lib/api`는 `src/lib/api.ts`다.

템플릿이 생성한 데모 파일(`src/app/explore.tsx`, `src/components/themed-text.tsx` 등)은 Task 1에서 `npm run reset-project`로 정리한다.

책임 분리 원칙: `src/app/`의 화면은 데이터 출처를 모른다. `src/lib/api.ts`만이 mock 여부를 안다. `src/components/`는 props만 받는 순수 표현 컴포넌트로, 데이터 페칭을 하지 않는다.

---

## Task 1: 프로젝트 생성과 Development Build 설치

가장 오래 걸리고(클라우드 빌드 15~20분) 가장 잘 막히는 단계다. 다른 작업을 시작하기 전에 반드시 끝낸다.

**Files:**
- Create: 프로젝트 전체 (`create-expo-app`이 생성)
- Modify: `package.json` (스크립트 확인)

**Interfaces:**
- Consumes: 없음
- Produces: 폰에 설치된 development build APK, `app.json`의 `extra.eas.projectId`

- [x] **Step 1: 프로젝트 생성** — 완료

```bash
cd C:/Users/SSAFY/Desktop/notification
npx create-expo-app@latest mobile
cd mobile
```

생성된 것은 **Expo SDK 57** 템플릿이며 TypeScript, Expo Router, `src/` 구조를 포함한다. `expo-dev-client`, `expo-device`, `expo-constants`가 이미 의존성에 들어 있다.

- [x] **Step 2: 개발 서버가 뜨는지 확인** — 완료

```bash
npx expo start
```

터미널에 QR 코드가 나오면 성공. `Ctrl+C`로 종료한다.

- [x] **Step 3: EAS CLI 설치와 로그인** — 완료

```bash
npm install -g eas-cli
eas login
```

- [x] **Step 4: EAS 프로젝트 등록** — 완료

```bash
eas init
```

`app.json`의 `extra.eas.projectId`에 값이 들어갔다. **이 값이 없으면 푸시 토큰을 발급받을 수 없다.**

- [x] **Step 5: dev client 설치와 빌드 프로필 생성** — 완료

```bash
npx expo install expo-dev-client
eas build:configure
```

`eas.json`의 `development` 프로필에 `"developmentClient": true`와 `"distribution": "internal"`이 있는지 확인한다.

- [x] **Step 5-1: 에이전트 스킬 심링크를 업로드에서 제외** — 완료

`eas init`은 `.claude/skills/*` 를 `.agents/skills/*` 로 가리키는 심볼릭 링크로 설치한다. Windows에서는 심링크 생성에 관리자 권한이 필요해, EAS가 프로젝트를 임시 폴더로 복제할 때 다음 오류로 죽는다:

```
EPERM: operation not permitted, symlink '...\.agents\skills\eas-app-stores' -> '...\.claude\skills\eas-app-stores'
Failed to upload the project tarball to EAS Build
```

이 문서들은 빌드와 무관하므로 저장소 루트의 `.gitignore`와 `.easignore`에서 제외한다. **`.easignore`가 존재하면 `.gitignore`를 대체하므로 `node_modules/` 등 기본 제외 대상도 함께 적어야 한다.**

대안으로 Windows 개발자 모드(`설정 > 개인 정보 및 보안 > 개발자용`)를 켜면 심링크 생성이 허용되지만, 어차피 올릴 필요 없는 파일이므로 제외하는 편이 낫다.

**왜 `mobile/`이 아니라 저장소 루트가 문제인가:** EAS는 업로드 범위를 `eas.json` 위치가 아니라 **git 저장소 루트**로 잡는다. 모노레포에서 앱이 형제 패키지(`packages/ui` 등)를 참조할 수 있기 때문이다. 저장소 전체를 올린 뒤 `eas.json`이 있는 하위 폴더에서 빌드한다. 따라서 `.easignore`는 반드시 **저장소 루트**(`notification/`)에 둬야 하며, `mobile/`에 두면 효과가 없다.

**20분짜리 빌드를 낭비하지 않고 검증하는 방법:**

```bash
eas build:inspect -p android -s archive -o <출력폴더> -e development
```

업로드될 아카이브를 로컬에 그대로 뽑아준다. 출력 폴더에서 `.agents/`, `.claude/`, `docs/`가 **빈 디렉터리**이고 `node_modules`가 없으면 정상이다. 이 단계가 통과하면 실제 빌드의 업로드 단계도 통과한다.

- [ ] **Step 5-2: 네이티브 모듈을 빌드 전에 모두 설치**

development build는 네이티브 껍데기이고 JS는 Metro가 실시간으로 공급한다. 따라서 **JS 코드 수정에는 재빌드가 필요 없지만, 네이티브 모듈을 추가하면 재빌드가 필요하다.**

| 작업 | 재빌드 |
|---|---|
| `.ts` / `.tsx` 수정, 스타일 변경 | 불필요 |
| 순수 JS 패키지 추가 (`date-fns`, `@tanstack/react-query`, `nativewind`) | 불필요 (Metro 재시작만) |
| 네이티브 모듈 추가 (`expo-notifications`, `expo-clipboard`) | **필요** |
| `app.json` 변경 (이름, 아이콘, 권한, 패키지명) | **필요** |
| Expo SDK 업그레이드 | **필요** |

Phase 1에서 필요한 네이티브 모듈은 아래 둘뿐이다. 빌드 전에 함께 설치하면 **Phase 1 전체에서 빌드는 한 번으로 끝난다.**

```bash
npx expo install expo-notifications expo-clipboard
```

빠뜨리면 Task 2에서 20분짜리 빌드를 다시 돌려야 한다. EAS 무료 티어에는 월 빌드 횟수 제한도 있다.

- [ ] **Step 5-3: Android FCM 자격증명 설정**

**이 단계를 빠뜨리면 토큰은 정상 발급되는데 알림만 오지 않는다.** 원인을 찾기 가장 어려운 유형의 실패이므로 빌드 전에 끝낸다.

Expo Push Service를 쓰더라도 Android 전달은 결국 FCM을 거친다. Expo가 내 앱으로 알림을 밀어넣으려면 **내 Firebase 프로젝트의 자격증명**이 필요하다. Expo Go는 Expo 소유 Firebase 프로젝트를 쓰지만, 내가 만든 빌드는 내 것을 써야 한다.

현재 상태는 `eas credentials`로 확인한다. `Push Notifications (FCM V1)`이 `None assigned yet`이면 설정이 필요하다.

```bash
eas credentials
# Android → development 선택
```

**1. Firebase 프로젝트 생성**

https://console.firebase.google.com 에서 프로젝트를 만든다. 이름은 무엇이든 좋다. Google Analytics는 필요 없으므로 끈다.

**2. Android 앱 등록**

프로젝트에 Android 앱을 추가한다. 패키지 이름은 `app.json`의 `expo.android.package`와 **정확히 일치해야 한다.**

```
com.kkh.mobile
```

한 글자라도 다르면 알림이 전달되지 않는다. 등록 후 `google-services.json`을 내려받는다. 이어지는 "SDK 추가", "Gradle 설정" 안내는 **모두 건너뛴다** — Expo가 대신 처리한다.

**3. `google-services.json` 배치**

파일을 `mobile/google-services.json`으로 저장하고 `app.json`의 `android` 블록에 경로를 지정한다.

```json
"android": {
  "package": "com.kkh.mobile",
  "googleServicesFile": "./google-services.json",
  ...
}
```

이 파일은 클라이언트 설정이며 비밀값이 아니다. 커밋해도 된다. 오히려 EAS 빌드에 포함되어야 하므로 `.easignore`에 넣으면 안 된다.

**4. 서비스 계정 키 발급**

Firebase 콘솔 → 프로젝트 설정(톱니) → **서비스 계정** 탭 → "새 비공개 키 생성" → JSON 파일을 내려받는다.

⚠️ **이 파일은 비밀키다.** 이것만 있으면 누구든 내 앱 사용자 전체에게 알림을 보낼 수 있다. **절대 커밋하지 말 것.** 프로젝트 폴더 밖(예: `Downloads`)에 두는 편이 실수를 막는다.

**5. EAS에 업로드**

```bash
eas credentials
```

`Android` → `development` → `Google Service Account` → `Manage your Google Service Account Key for Push Notifications (FCM V1)` → `Set up a Google Service Account Key`를 고르고 4번에서 받은 JSON 경로를 입력한다.

완료 후 다시 `eas credentials`로 확인해 `Push Notifications (FCM V1)`에 키가 표시되면 성공이다.

**6. 재빌드 필요**

`google-services.json`은 APK에 포함되어야 하므로 이 설정 후에는 반드시 다시 빌드한다.

- [ ] **Step 6: Development Build 실행**

```bash
eas build --profile development --platform android
```

클라우드에서 15~20분 걸린다. **이 시간 동안 Task 5(타입과 mock 데이터)를 병행해도 된다.** Task 2·3은 이 빌드가 있어야 하므로 진행할 수 없다.

- [ ] **Step 7: 폰에 설치**

빌드가 끝나면 터미널에 링크와 QR이 나온다. 폰으로 열어 APK를 받아 설치한다. "출처를 알 수 없는 앱" 경고가 뜨면 허용한다.

- [ ] **Step 8: 🚩 검증 — 폰에서 개발 서버에 연결**

```bash
npx expo start --dev-client
```

폰에서 설치한 앱을 열고 QR을 스캔한다. Expo 기본 화면이 폰에 뜨면 성공이다.

`src/app/index.tsx`의 텍스트를 아무거나 바꿔 저장했을 때 폰 화면이 즉시 바뀌는지 확인한다. 바뀌면 개발 루프가 완성된 것이다.

**이 환경에서는 위 명령이 그냥은 동작하지 않는다.** 개발 서버는 PC의 사설 IP(`70.12.246.57`)로 접속을 요구하는데, 폰이 LTE에 있거나 교육기관 WiFi의 AP 격리가 켜져 있으면 그 주소에 닿을 수 없다. `ipconfig`에 함께 나오는 `vEthernet (...)` 계열 주소(`172.28.96.1`, `172.20.160.1`)는 Hyper-V/WSL 전용 가상 네트워크이므로 접속 대상이 아니다.

**해결: Tailscale을 쓴다.** PC에 이미 설치되어 있고 주소는 `100.79.222.81`이다. 폰에 Tailscale 앱을 설치해 같은 계정으로 로그인한다.

그다음 `mobile/.env.local`에 접속 주소를 적어둔다. 매번 터미널에 환경변수를 넣지 않기 위해서다.

```
REACT_NATIVE_PACKAGER_HOSTNAME=100.79.222.81
```

이제 평소대로 실행하면 된다.

```bash
npx expo start --dev-client
```

시작할 때 다음이 출력되면 정상이다.

```
env: load .env.local
env: export REACT_NATIVE_PACKAGER_HOSTNAME
```

이 변수가 QR과 접속 URL을 Tailscale 주소로 생성한다. 없으면 QR에 사설 IP가 박혀 여전히 실패한다. Tailscale은 가능하면 P2P로 직결되므로 `--tunnel`보다 핫 리로드가 빠르다.

⚠️ **파일명이 `.env`가 아니라 `.env.local`이어야 한다.** Expo는 이 변수를 개발자 개인 설정으로 분류해 `.env`에 있으면 다음 오류로 거부한다.

```
Error: Refused to load personal environment variables from a non-.local env file.
```

PC마다 IP가 다르므로 팀 공유용 `.env`에 들어가면 안 된다는 뜻이다. `.env*.local`은 `mobile/.gitignore`에 이미 등록되어 있어 커밋되지 않는다.

Phase 2에서 백엔드를 붙일 때 `EXPO_PUBLIC_API_URL`도 같은 파일에 추가한다.

대안 (Tailscale이 막힐 때):
- **폰 핫스팟** — PC를 폰 핫스팟에 연결하면 같은 네트워크가 되고 AP 격리가 없다. 가장 빠르다.
- **`npx expo start --dev-client --tunnel`** — ngrok 경유. 네트워크와 무관하게 되지만 느리다.

진단 방법: 개발 서버를 띄운 상태에서 폰 브라우저로 `http://<주소>:8081`을 연다. 응답이 오면 네트워크는 정상이다. 브라우저와 앱은 같은 TCP 연결을 쓰므로 이 테스트가 유효하다.

- [ ] **Step 9: 템플릿 데모 파일 정리**

템플릿에는 탭 네비게이션과 예제 화면(`src/app/explore.tsx`, `src/components/themed-text.tsx` 등)이 들어 있다. 우리 화면과 섞이면 혼란스러우므로 정리한다.

```bash
npm run reset-project
```

기존 파일은 `app-example/`로 옮겨지고 빈 `src/app/index.tsx`와 `src/app/_layout.tsx`만 남는다. 이후 `app-example/` 폴더는 삭제해도 된다.

- [ ] **Step 10: 삼성 기기라면 배터리 최적화 해제**

`설정 > 배터리 > 백그라운드 사용 제한 > 절전 앱`에서 이 앱이 있으면 제거한다. 없어도 며칠 뒤 자동 추가될 수 있으므로, 알림이 안 오면 여기를 먼저 확인한다.

- [ ] **Step 11: 커밋**

```bash
cd C:/Users/SSAFY/Desktop/notification
git add -A
git commit -m "feat: Expo 프로젝트 생성 및 development build 설정"
```

---

## Task 2: 푸시 토큰 발급과 수신 검증

**이 프로젝트의 핵심 관문이다.** 여기가 통과하면 나머지는 평범한 UI 작업이다.

**Files:**
- Create: `src/lib/push.ts`
- Modify: `src/app/index.tsx` (임시 검증 화면)

**Interfaces:**
- Consumes: Task 1의 `extra.eas.projectId`
- Produces: `registerForPushNotifications(): Promise<PushRegistration>` — `src/lib/push.ts`에서 export

```ts
type PushRegistration =
  | { ok: true; token: string }
  | { ok: false; reason: "not-device" | "denied" | "error"; message: string }
```

- [ ] **Step 1: 푸시 패키지 설치**

Task 1 Step 5-2에서 `expo-notifications`와 `expo-clipboard`를 이미 설치했다면 건너뛴다. 설치를 빠뜨렸다면 지금 설치하고 **development build를 다시 만들어야 한다** (Task 1 Step 6 재실행) — 둘 다 네이티브 모듈이기 때문이다.

```bash
cd C:/Users/SSAFY/Desktop/notification/mobile
npx expo install expo-notifications expo-clipboard
```

`expo-device`와 `expo-constants`는 템플릿에 이미 포함되어 있으므로 설치할 필요가 없다.

- [ ] **Step 2: `src/lib/push.ts` 작성**

```ts
import * as Notifications from "expo-notifications"
import * as Device from "expo-device"
import Constants from "expo-constants"
import { Platform } from "react-native"

export type PushRegistration =
  | { ok: true; token: string }
  | { ok: false; reason: "not-device" | "denied" | "error"; message: string }

/**
 * Android 8.0+ 에서는 알림이 반드시 채널에 속해야 한다.
 * 채널이 없으면 알림이 무시되거나 소리 없이 상태바에만 들어간다.
 * importance MAX 여야 화면 상단에 팝업(heads-up)으로 뜬다.
 */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return
  await Notifications.setNotificationChannelAsync("builds", {
    name: "빌드 결과",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  })
}

export async function registerForPushNotifications(): Promise<PushRegistration> {
  if (!Device.isDevice) {
    return {
      ok: false,
      reason: "not-device",
      message: "푸시 알림은 실기기에서만 동작합니다. 에뮬레이터에서는 사용할 수 없습니다.",
    }
  }

  await ensureChannel()

  const existing = await Notifications.getPermissionsAsync()
  let granted = existing.granted
  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync()
    granted = requested.granted
  }
  if (!granted) {
    return {
      ok: false,
      reason: "denied",
      message: "알림 권한이 거부되었습니다. 설정에서 알림을 허용해주세요.",
    }
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId
  if (!projectId) {
    return {
      ok: false,
      reason: "error",
      message: "EAS projectId가 없습니다. `eas init`을 실행했는지 확인하세요.",
    }
  }

  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId })
    return { ok: true, token: result.data }
  } catch (e) {
    return {
      ok: false,
      reason: "error",
      message: `토큰 발급 실패: ${String(e)}`,
    }
  }
}
```

- [ ] **Step 3: 임시 검증 화면 작성**

`src/app/index.tsx`를 통째로 교체한다. 이 화면은 Task 6에서 목록 화면으로 대체된다.

```tsx
import { useEffect, useState } from "react"
import { Button, Pressable, ScrollView, Text, View } from "react-native"
import * as Clipboard from "expo-clipboard"
import { registerForPushNotifications, type PushRegistration } from "@/lib/push"

export default function Index() {
  const [reg, setReg] = useState<PushRegistration | null>(null)
  const [copied, setCopied] = useState(false)

  async function run() {
    setReg(null)
    setReg(await registerForPushNotifications())
  }

  useEffect(() => {
    run()
  }, [])

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>푸시 토큰</Text>

      {reg === null && <Text>발급 중...</Text>}

      {reg?.ok === false && (
        <View style={{ gap: 12 }}>
          <Text style={{ color: "#b91c1c" }}>{reg.message}</Text>
          <Button title="다시 시도" onPress={run} />
        </View>
      )}

      {reg?.ok === true && (
        <View style={{ gap: 12 }}>
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(reg.token)
              setCopied(true)
            }}
            style={{ backgroundColor: "#f3f4f6", padding: 12, borderRadius: 8 }}
          >
            <Text selectable style={{ fontFamily: "monospace" }}>
              {reg.token}
            </Text>
          </Pressable>
          <Text style={{ color: "#6b7280" }}>
            {copied ? "복사됨" : "탭하면 복사됩니다"}
          </Text>
        </View>
      )}
    </ScrollView>
  )
}
```

- [ ] **Step 4: 앱 실행하고 토큰 확인**

```bash
npx expo start --dev-client
```

폰에서 앱을 열면 알림 권한 요청 팝업이 뜬다. **허용**을 누른다.

`ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]` 형태의 문자열이 화면에 나와야 한다. 탭해서 복사한다.

**여기서 실패하면 다음을 순서대로 확인한다:**
- "실기기에서만" 메시지 → 에뮬레이터로 실행 중이다. 실기기를 쓴다.
- "EAS projectId가 없습니다" → `app.json`에 `extra.eas.projectId`가 있는지 확인. 없으면 `eas init` 재실행.
- 권한 팝업이 안 뜸 → 이미 거부한 상태다. 폰 설정에서 앱 알림을 켜고 재실행.

- [ ] **Step 5: 🚩 검증 — 앱을 완전히 종료한 상태에서 알림 수신**

이것이 이 프로젝트 전체에서 가장 중요한 검증이다.

1. 폰에서 앱을 **완전히 종료**한다 (최근 앱 목록에서 스와이프로 닫기)
2. PC 브라우저에서 https://expo.dev/notifications 를 연다
3. `Expo push token` 칸에 복사한 토큰을 붙여넣는다
4. Title: `✅ my-service #42`, Body: `main · 2m 13s`
5. `Data (JSON)` 칸에 `{"buildId":"my-service#42"}` 입력
6. **Android 항목의 `Channel ID`에 `builds` 입력** — 비워두면 알림이 조용히 사라질 수 있다
7. Send 클릭

**폰 알림창에 알림이 떠야 한다.** 앱이 꺼져 있어도 뜬다.

**안 뜨면 확인 순서:**
- `eas credentials`에서 `Push Notifications (FCM V1)`에 키가 등록되어 있는가 (Task 1 Step 5-3). **토큰이 발급되는데 알림만 안 오면 대부분 이것이다**
- `google-services.json`을 추가한 뒤 재빌드한 APK를 설치했는가
- Firebase에 등록한 패키지명이 `app.json`의 `android.package`와 정확히 같은가
- 채널 ID를 `builds`로 넣었는가
- 폰 설정에서 앱 알림이 켜져 있는가
- 삼성이면 배터리 최적화에서 제외했는가 (Task 1 Step 10)
- 폰이 절전 모드가 아닌가

expo.dev/notifications의 응답에 `MismatchSenderId`나 `InvalidCredentials`가 보이면 FCM 자격증명 문제가 확정이다.

- [ ] **Step 6: 커밋**

```bash
cd C:/Users/SSAFY/Desktop/notification
git add -A
git commit -m "feat: 푸시 권한 요청 및 토큰 발급 구현"
```

---

## Task 3: 알림 핸들러와 탭 라우팅

알림을 탭하면 해당 빌드 상세로 이동시키는 배선. 상세 화면은 아직 없으므로 임시 화면을 만든다.

**Files:**
- Create: `src/app/build/[id].tsx` (임시)
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Consumes: Task 2의 알림 채널
- Produces: `data.buildId`가 담긴 알림을 탭하면 `/build/<id>`로 이동하는 동작

- [ ] **Step 1: 임시 상세 화면 생성**

```tsx
// src/app/build/[id].tsx
import { useLocalSearchParams } from "expo-router"
import { Text, View } from "react-native"

export default function BuildDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return (
    <View style={{ padding: 24 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>상세 화면</Text>
      <Text selectable>buildId: {id}</Text>
    </View>
  )
}
```

- [ ] **Step 2: `src/app/_layout.tsx` 작성**

```tsx
import { useEffect } from "react"
import { Stack, router } from "expo-router"
import * as Notifications from "expo-notifications"

/**
 * 앱이 화면에 떠 있을 때 알림은 기본적으로 표시되지 않는다.
 * 개발 중 "알림이 안 온다"는 오진을 막기 위해 포그라운드에서도 표시한다.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export default function RootLayout() {
  // useLastNotificationResponse는 앱이 종료된 상태에서 알림을 탭해
  // 콜드 스타트한 경우도 포함해 마지막 응답을 돌려준다.
  const response = Notifications.useLastNotificationResponse()

  useEffect(() => {
    const data = response?.notification.request.content.data
    const buildId = data?.buildId
    if (typeof buildId === "string" && buildId.length > 0) {
      router.push(`/build/${encodeURIComponent(buildId)}`)
    }
  }, [response])

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "빌드" }} />
      <Stack.Screen name="build/[id]" options={{ title: "빌드 상세" }} />
    </Stack>
  )
}
```

`shouldShowAlert`는 구버전, `shouldShowBanner`/`shouldShowList`는 신버전 필드명이다. 둘 다 넣어두면 SDK 버전과 무관하게 동작한다. 타입 에러가 나면 사용 중인 SDK가 인식하는 쪽만 남긴다.

- [ ] **Step 3: 🚩 검증 — 앱 종료 상태에서 알림 탭**

1. 앱을 완전히 종료한다
2. expo.dev/notifications에서 `Data (JSON)`에 `{"buildId":"my-service#42"}`, `Channel ID`에 `builds`를 넣고 발송한다
3. 알림을 **탭**한다

앱이 실행되면서 상세 화면이 열리고 `buildId: my-service#42`가 표시되어야 한다.

**`#` 때문에 라우팅이 깨지면** (상세 화면이 안 열리거나 id가 잘림): `src/app/build/[id].tsx` 대신 쿼리 파라미터 방식으로 전환한다. `router.push({ pathname: "/build", params: { id: buildId } })`로 바꾸고 파일을 `src/app/build.tsx`로 옮긴다. 이 경우 이후 태스크의 경로도 함께 맞춘다.

- [ ] **Step 4: 🚩 검증 — 앱이 켜져 있을 때도 알림 표시**

앱을 열어둔 상태로 다시 발송한다. 화면 상단에 알림 배너가 떠야 한다. 안 뜨면 `setNotificationHandler`의 필드명이 SDK와 안 맞는 것이다.

- [ ] **Step 5: 커밋**

```bash
cd C:/Users/SSAFY/Desktop/notification
git add -A
git commit -m "feat: 알림 포그라운드 표시 및 탭 라우팅 구현"
```

---

## Task 4: NativeWind와 react-native-reusables 설정

**Files:**
- Create: `tailwind.config.js`, `metro.config.js`, `babel.config.js`, `nativewind-env.d.ts`
- Modify: `src/global.css` (템플릿이 이미 생성해 둔 파일), `src/app/_layout.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: 모든 컴포넌트에서 `className="..."` 사용 가능

템플릿에는 `metro.config.js`와 `babel.config.js`가 없다. Expo 기본값을 쓰기 때문이다. NativeWind가 이 둘을 요구하므로 새로 만든다. 반면 `src/global.css`는 이미 존재하며 CSS 변수만 들어 있다 — 지우지 말고 Tailwind 지시자를 앞에 추가한다.

- [ ] **Step 1: react-native-reusables CLI로 초기화 시도**

```bash
cd C:/Users/SSAFY/Desktop/notification/mobile
npx @react-native-reusables/cli@latest init
```

이 CLI는 shadcn/ui와 같은 방식으로 동작한다 — **패키지를 의존성으로 추가하는 게 아니라, 컴포넌트 소스 코드를 내 프로젝트에 복사해 넣는다.** 그래서 나중에 자유롭게 고칠 수 있다. `init`은 그 준비 작업(설정 파일 생성, 유틸 함수 추가)을 한다.

이 CLI가 NativeWind 설정을 대신 해주는 경우가 많다. **CLI가 설정을 마쳤다면 Step 2~6을 건너뛰고 Step 7로 간다.** CLI가 없거나 실패하면 Step 2부터 수동으로 진행한다.

⚠️ CLI가 `src/` 구조를 인식하지 못하고 루트에 `components/`, `lib/`를 만들 수 있다. 그런 경우 생성된 파일을 `src/` 아래로 옮기고 import를 `@/`로 고친다.

NativeWind 설정 파일 형식은 버전마다 바뀐다. 아래는 검증용 체크리스트로 쓰고, 충돌이 나면 https://www.nativewind.dev/docs/getting-started/installation 의 현재 문서를 우선한다.

- [ ] **Step 2: 패키지 설치**

```bash
npx expo install nativewind tailwindcss
```

`tailwindcss`는 클래스 이름을 해석하는 엔진이고, `nativewind`는 그 결과를 **React Native의 `StyleSheet` 객체로 변환**하는 어댑터다. RN에는 CSS가 없으므로 이 변환이 필요하다. 둘 다 빌드 타임에만 동작하는 순수 JS 패키지라 **네이티브 재빌드가 필요 없다.**

`react-native-reanimated`와 `react-native-safe-area-context`는 템플릿에 이미 포함되어 있다.

- [ ] **Step 3: `tailwind.config.js` 생성**

`content`가 `src/`를 가리켜야 한다. 여기가 틀리면 클래스가 조용히 무시된다.

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 4: `src/global.css` 수정**

이 파일은 이미 존재하며 폰트 관련 CSS 변수가 들어 있다. **기존 내용을 지우지 말고** 맨 위에 Tailwind 지시자를 추가한다.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* 기존 --font-* 변수들을 그대로 둔다 */
}
```

- [ ] **Step 5: `babel.config.js`와 `metro.config.js` 수정**

```js
// babel.config.js
module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  }
}
```

```js
// metro.config.js
const { getDefaultConfig } = require("expo/metro-config")
const { withNativeWind } = require("nativewind/metro")

const config = getDefaultConfig(__dirname)

module.exports = withNativeWind(config, { input: "./src/global.css" })
```

경로가 `./global.css`가 아니라 **`./src/global.css`**다.

- [ ] **Step 6: 타입 선언과 CSS 로드**

```ts
// nativewind-env.d.ts
/// <reference types="nativewind/types" />
```

`src/app/_layout.tsx` 최상단에 추가한다. `src/app/`에서 `src/global.css`로 가는 상대 경로다.

```tsx
import "../global.css"
```

- [ ] **Step 7: 경로 별칭 확인**

`tsconfig.json`에 이미 다음이 설정되어 있다. 수정할 것이 없고, 값이 맞는지만 확인한다.

```json
"paths": {
  "@/*": ["./src/*"],
  "@/assets/*": ["./assets/*"]
}
```

- [ ] **Step 8: 🚩 검증 — Tailwind 클래스가 먹는지 확인**

`src/app/build/[id].tsx`의 바깥 `View`를 임시로 바꾼다:

```tsx
<View className="flex-1 items-center justify-center bg-blue-500">
```

캐시를 비우고 재시작한다:

```bash
npx expo start --dev-client --clear
```

`--clear`가 핵심이다. Metro는 변환 결과를 캐시해두는데, 방금 만든 `metro.config.js`·`babel.config.js`·`tailwind.config.js`는 **캐시를 비우지 않으면 반영되지 않는다.** 이걸 빠뜨리면 설정이 맞는데도 클래스가 안 먹혀서 원인을 엉뚱한 데서 찾게 된다.

상세 화면 배경이 파란색이 되고 내용이 가운데 정렬되면 성공이다. **안 되면 다음 태스크로 넘어가지 말 것** — 이후 모든 UI가 이 설정에 의존한다.

확인 후 임시 `className`은 되돌린다.

- [ ] **Step 9: UI 컴포넌트 추가**

```bash
npx @react-native-reusables/cli@latest add text button card
```

`add`는 지정한 컴포넌트의 **소스 파일을 내 프로젝트에 복사**한다. 설치가 아니라 복사라서, 복사된 파일은 내 코드이고 마음대로 수정해도 된다.

`src/components/ui/` 아래에 파일이 생성된다 (루트에 생겼다면 `src/` 아래로 옮긴다). CLI가 다른 이름을 요구하면 `npx @react-native-reusables/cli@latest add` 를 인자 없이 실행해 사용 가능한 목록을 확인한다.

- [ ] **Step 10: 커밋**

```bash
cd C:/Users/SSAFY/Desktop/notification
git add -A
git commit -m "chore: NativeWind 및 react-native-reusables 설정"
```

---

## Task 5: 타입, mock 데이터, API 계층

Task 1의 클라우드 빌드를 기다리는 동안 병행 가능한 유일한 태스크다.

**Files:**
- Create: `src/lib/types.ts`, `src/lib/mock.ts`, `src/lib/api.ts`, `src/lib/format.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `src/lib/types.ts`: `type BuildStatus`, `type Build`
  - `src/lib/api.ts`: `fetchBuilds(limit?: number): Promise<Build[]>`, `fetchBuild(id: string): Promise<Build>`, `registerDevice(expoPushToken: string): Promise<void>`
  - `src/lib/format.ts`: `formatDuration(ms: number): string`, `formatRelative(iso: string): string`

- [ ] **Step 1: `src/lib/types.ts` 작성**

```ts
export type BuildStatus = "SUCCESS" | "FAILURE" | "ABORTED" | "UNSTABLE"

export type Build = {
  id: string // "my-service#42"
  job: string // "my-service"
  number: number // 42
  status: BuildStatus
  branch: string // "main"
  commit: string // short sha
  message: string // 커밋 메시지
  durationMs: number
  finishedAt: string // ISO8601
  url: string // Jenkins 빌드 페이지 링크
}
```

- [ ] **Step 2: `src/lib/mock.ts` 작성**

네 가지 상태가 모두 포함되도록 구성한다. UI가 모든 분기를 실제로 렌더링해봐야 하기 때문이다.

```ts
import type { Build } from "./types"

export const MOCK_BUILDS: Build[] = [
  {
    id: "my-service#42",
    job: "my-service",
    number: 42,
    status: "SUCCESS",
    branch: "main",
    commit: "a1b2c3d",
    message: "fix: 로그인 리다이렉트 경로 수정",
    durationMs: 133_000,
    finishedAt: "2026-08-11T09:12:00.000Z",
    url: "https://jenkins.example.com/job/my-service/42/",
  },
  {
    id: "my-service#41",
    job: "my-service",
    number: 41,
    status: "FAILURE",
    branch: "feature/payment",
    commit: "9f8e7d6",
    message: "feat: 결제 취소 API 추가",
    durationMs: 47_000,
    finishedAt: "2026-08-11T08:40:00.000Z",
    url: "https://jenkins.example.com/job/my-service/41/",
  },
  {
    id: "batch-worker#17",
    job: "batch-worker",
    number: 17,
    status: "UNSTABLE",
    branch: "main",
    commit: "5c4b3a2",
    message: "chore: 재시도 횟수 조정",
    durationMs: 302_000,
    finishedAt: "2026-08-11T07:05:00.000Z",
    url: "https://jenkins.example.com/job/batch-worker/17/",
  },
  {
    id: "my-service#40",
    job: "my-service",
    number: 40,
    status: "ABORTED",
    branch: "feature/payment",
    commit: "1a2b3c4",
    message: "wip: 결제 모듈 리팩터링",
    durationMs: 12_000,
    finishedAt: "2026-08-10T22:31:00.000Z",
    url: "https://jenkins.example.com/job/my-service/40/",
  },
]
```

- [ ] **Step 3: `src/lib/api.ts` 작성**

**이 파일만이 mock 여부를 안다.** 화면은 절대 `MOCK_BUILDS`를 직접 import하지 않는다.

```ts
import type { Build } from "./types"
import { MOCK_BUILDS } from "./mock"

/** Phase 2에서 백엔드를 붙일 때 false로 바꾼다. */
const USE_MOCK = true

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? ""

/** mock 모드에서 로딩 상태 UI를 확인할 수 있도록 지연을 준다. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) throw new Error(`GET ${path} 실패 (${res.status})`)
  return (await res.json()) as T
}

export async function fetchBuilds(limit = 30): Promise<Build[]> {
  if (USE_MOCK) {
    await delay(400)
    return MOCK_BUILDS.slice(0, limit)
  }
  const data = await get<{ builds: Build[] }>(`/api/builds?limit=${limit}`)
  return data.builds
}

export async function fetchBuild(id: string): Promise<Build> {
  if (USE_MOCK) {
    await delay(200)
    const found = MOCK_BUILDS.find((b) => b.id === id)
    if (!found) throw new Error(`빌드를 찾을 수 없습니다: ${id}`)
    return found
  }
  return get<Build>(`/api/builds/${encodeURIComponent(id)}`)
}

export async function registerDevice(expoPushToken: string): Promise<void> {
  if (USE_MOCK) {
    console.log("[mock] registerDevice", expoPushToken)
    return
  }
  const res = await fetch(`${BASE_URL}/api/devices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expoPushToken }),
  })
  if (!res.ok) throw new Error(`디바이스 등록 실패 (${res.status})`)
}
```

- [ ] **Step 4: `src/lib/format.ts` 작성**

```ts
import { formatDistanceToNow } from "date-fns"
import { ko } from "date-fns/locale"

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

export function formatRelative(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ko })
}
```

- [ ] **Step 5: date-fns 설치**

```bash
cd C:/Users/SSAFY/Desktop/notification/mobile
npm install date-fns
```

Expo가 관리하는 패키지가 아니므로 `npm install`을 쓴다.

- [ ] **Step 6: 🚩 검증 — 타입 체크 통과**

```bash
npx tsc --noEmit
```

TypeScript 컴파일러를 **타입 검사 전용으로** 돌린다. `--noEmit`은 "JS 파일은 만들지 마라"는 뜻이다. 실제 변환은 Metro가 하므로 여기서는 검사만 필요하다.

아무 출력 없이 끝나면 통과다. 파일을 만들었지만 아직 화면에서 쓰지 않는 지금 단계에서, import 경로(`@/lib/...`)와 타입이 맞는지 미리 확인하는 용도다.

- [ ] **Step 7: 커밋**

```bash
cd C:/Users/SSAFY/Desktop/notification
git add -A
git commit -m "feat: Build 타입, mock 데이터, API 계층 추가"
```

---

## Task 6: 빌드 목록 화면

**Files:**
- Create: `src/components/StatusBadge.tsx`, `src/components/BuildCard.tsx`
- Modify: `src/app/index.tsx`, `src/app/_layout.tsx`

**Interfaces:**
- Consumes: `fetchBuilds`, `registerDevice` (Task 5), `formatDuration`, `formatRelative` (Task 5), `registerForPushNotifications` (Task 2)
- Produces: `StatusBadge({ status: BuildStatus })`, `BuildCard({ build: Build, onPress: () => void })`

- [ ] **Step 1: TanStack Query 설치**

```bash
cd C:/Users/SSAFY/Desktop/notification/mobile
npm install @tanstack/react-query
```

웹에서 쓰는 것과 **완전히 같은 패키지**다. RN 전용 버전이 따로 없다. 순수 JS라 네이티브 재빌드가 필요 없고, `npx expo install`이 아니라 `npm install`을 쓴다.

이 라이브러리가 대신 해주는 일: 로딩 상태, 에러 상태, 캐싱, pull-to-refresh, 재시도. 직접 `useState` + `useEffect`로 짜면 화면마다 반복되는 코드다.

- [ ] **Step 2: `src/app/_layout.tsx`에 QueryClientProvider 추가**

Task 3에서 만든 파일에 Provider를 감싼다. 기존 알림 관련 코드는 그대로 둔다.

```tsx
import "../global.css"
import { useEffect, useState } from "react"
import { Stack, router } from "expo-router"
import * as Notifications from "expo-notifications"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient())
  const response = Notifications.useLastNotificationResponse()

  useEffect(() => {
    const buildId = response?.notification.request.content.data?.buildId
    if (typeof buildId === "string" && buildId.length > 0) {
      router.push(`/build/${encodeURIComponent(buildId)}`)
    }
  }, [response])

  return (
    <QueryClientProvider client={queryClient}>
      <Stack>
        <Stack.Screen name="index" options={{ title: "빌드" }} />
        <Stack.Screen name="build/[id]" options={{ title: "빌드 상세" }} />
      </Stack>
    </QueryClientProvider>
  )
}
```

- [ ] **Step 3: `src/components/StatusBadge.tsx` 작성**

```tsx
import { Text, View } from "react-native"
import type { BuildStatus } from "@/lib/types"

const STYLE: Record<BuildStatus, { box: string; text: string; label: string }> = {
  SUCCESS: { box: "bg-green-100", text: "text-green-800", label: "성공" },
  FAILURE: { box: "bg-red-100", text: "text-red-800", label: "실패" },
  ABORTED: { box: "bg-gray-200", text: "text-gray-700", label: "중단" },
  UNSTABLE: { box: "bg-yellow-100", text: "text-yellow-800", label: "불안정" },
}

export function StatusBadge({ status }: { status: BuildStatus }) {
  const s = STYLE[status]
  return (
    <View className={`rounded-full px-2 py-0.5 ${s.box}`}>
      <Text className={`text-xs font-semibold ${s.text}`}>{s.label}</Text>
    </View>
  )
}
```

- [ ] **Step 4: `src/components/BuildCard.tsx` 작성**

데이터를 가져오지 않는 순수 표현 컴포넌트다. props만 받는다.

```tsx
import { Pressable, Text, View } from "react-native"
import type { Build } from "@/lib/types"
import { formatDuration, formatRelative } from "@/lib/format"
import { StatusBadge } from "./StatusBadge"

export function BuildCard({
  build,
  onPress,
}: {
  build: Build
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-60 border-b border-gray-200 px-4 py-3"
    >
      <View className="flex-row items-center gap-2">
        <StatusBadge status={build.status} />
        <Text className="flex-1 font-semibold" numberOfLines={1}>
          {build.job} #{build.number}
        </Text>
        <Text className="text-xs text-gray-500">
          {formatRelative(build.finishedAt)}
        </Text>
      </View>
      <Text className="mt-1 text-sm text-gray-700" numberOfLines={1}>
        {build.message}
      </Text>
      <Text className="mt-0.5 text-xs text-gray-500">
        {build.branch} · {build.commit} · {formatDuration(build.durationMs)}
      </Text>
    </Pressable>
  )
}
```

- [ ] **Step 5: `src/app/index.tsx`를 목록 화면으로 교체**

Task 2의 임시 토큰 화면을 대체한다. 토큰 발급은 계속하되, 화면 상단 배너로 상태만 알린다.

```tsx
import { useEffect, useState } from "react"
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native"
import { router } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import { fetchBuilds, registerDevice } from "@/lib/api"
import { registerForPushNotifications } from "@/lib/push"
import { BuildCard } from "@/components/BuildCard"

export default function Index() {
  const [pushError, setPushError] = useState<string | null>(null)

  // 앱 실행마다 토큰을 재발급해 서버에 재등록한다.
  // 로컬에 "등록됨" 플래그를 캐싱하면 OS가 토큰을 갱신했을 때
  // 재등록을 건너뛰어 알림이 조용히 끊긴다.
  useEffect(() => {
    ;(async () => {
      const reg = await registerForPushNotifications()
      if (!reg.ok) {
        setPushError(reg.message)
        return
      }
      setPushError(null)
      try {
        await registerDevice(reg.token)
      } catch {
        // 등록 실패는 앱 사용을 막지 않는다. 다음 실행에 재시도된다.
      }
    })()
  }, [])

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["builds"],
    queryFn: () => fetchBuilds(30),
  })

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    )
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <Text className="text-center text-red-700">
          빌드 목록을 불러오지 못했습니다.
        </Text>
        <Text className="text-center text-xs text-gray-500">
          {String(error)}
        </Text>
        <Pressable
          onPress={() => refetch()}
          className="rounded-lg bg-gray-900 px-4 py-2 active:opacity-70"
        >
          <Text className="font-semibold text-white">다시 시도</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-white">
      {pushError && (
        <View className="bg-amber-100 px-4 py-2">
          <Text className="text-xs text-amber-900">{pushError}</Text>
        </View>
      )}
      <FlatList
        data={data}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => (
          <BuildCard
            build={item}
            onPress={() => router.push(`/build/${encodeURIComponent(item.id)}`)}
          />
        )}
        onRefresh={() => refetch()}
        refreshing={isRefetching}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Text className="text-gray-500">빌드 기록이 없습니다.</Text>
          </View>
        }
      />
    </View>
  )
}
```

- [ ] **Step 6: 🚩 검증 — 목록이 뜨는지 확인**

앱을 열어 다음을 모두 확인한다:

- 잠깐 로딩 스피너가 보인 뒤 4개 항목이 뜬다
- 성공/실패/중단/불안정 배지 색이 각각 다르다
- 아래로 당기면(pull-to-refresh) 새로고침 인디케이터가 돈다
- 항목을 탭하면 상세 화면(아직 임시)으로 이동하고 buildId가 맞다

- [ ] **Step 7: 🚩 검증 — 권한 거부 시 배너**

폰 설정에서 앱 알림을 끄고 앱을 재시작한다. 목록 위에 노란 배너가 뜨고, **목록 자체는 정상 동작해야 한다.** 확인 후 알림을 다시 켠다.

- [ ] **Step 8: 커밋**

```bash
cd C:/Users/SSAFY/Desktop/notification
git add -A
git commit -m "feat: 빌드 목록 화면 구현"
```

---

## Task 7: 빌드 상세 화면

**Files:**
- Modify: `src/app/build/[id].tsx`

**Interfaces:**
- Consumes: `fetchBuild` (Task 5), `StatusBadge` (Task 6), `formatDuration`/`formatRelative` (Task 5)
- Produces: 없음 (최종 화면)

- [ ] **Step 1: `src/app/build/[id].tsx`를 실제 상세 화면으로 교체**

```tsx
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import { fetchBuild } from "@/lib/api"
import { StatusBadge } from "@/components/StatusBadge"
import { formatDuration, formatRelative } from "@/lib/format"

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row border-b border-gray-100 py-3">
      <Text className="w-24 text-sm text-gray-500">{label}</Text>
      <Text className="flex-1 text-sm" selectable>
        {value}
      </Text>
    </View>
  )
}

export default function BuildDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["build", id],
    queryFn: () => fetchBuild(id),
    enabled: Boolean(id),
  })

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    )
  }

  if (isError || !data) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <Text className="text-center text-red-700">
          빌드 정보를 불러오지 못했습니다.
        </Text>
        <Text className="text-center text-xs text-gray-500">{String(error)}</Text>
        <Pressable
          onPress={() => refetch()}
          className="rounded-lg bg-gray-900 px-4 py-2 active:opacity-70"
        >
          <Text className="font-semibold text-white">다시 시도</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="p-4">
      <View className="flex-row items-center gap-2">
        <StatusBadge status={data.status} />
        <Text className="text-lg font-bold">
          {data.job} #{data.number}
        </Text>
      </View>

      <Text className="mt-3 text-base">{data.message}</Text>

      <View className="mt-4">
        <Row label="브랜치" value={data.branch} />
        <Row label="커밋" value={data.commit} />
        <Row label="소요 시간" value={formatDuration(data.durationMs)} />
        <Row label="완료" value={formatRelative(data.finishedAt)} />
      </View>

      <Pressable
        onPress={() => Linking.openURL(data.url)}
        className="mt-6 rounded-lg bg-gray-900 px-4 py-3 active:opacity-70"
      >
        <Text className="text-center font-semibold text-white">
          Jenkins에서 열기
        </Text>
      </Pressable>
    </ScrollView>
  )
}
```

- [ ] **Step 2: 🚩 검증 — 목록에서 진입**

목록에서 각 항목을 하나씩 탭해 네 가지 상태가 모두 올바르게 표시되는지 확인한다. "Jenkins에서 열기"를 누르면 브라우저가 열린다 (mock URL이라 페이지는 없어도 됨).

- [ ] **Step 3: 🚩 최종 검증 — 알림 → 상세 전체 경로**

이것이 Phase 1의 완료 조건이다.

1. 앱을 **완전히 종료**한다
2. expo.dev/notifications에서 발송한다:
   - Title: `❌ my-service #41`
   - Body: `feature/payment · 47s`
   - Data: `{"buildId":"my-service#41"}`
   - Channel ID: `builds`
3. 알림창에 알림이 뜬다
4. 알림을 탭한다
5. 앱이 실행되며 **`my-service #41` 상세 화면이 바로 열린다** (목록이 아니라 상세)
6. 실패 배지가 빨간색으로, 브랜치가 `feature/payment`로 표시된다

- [ ] **Step 4: 커밋**

```bash
cd C:/Users/SSAFY/Desktop/notification
git add -A
git commit -m "feat: 빌드 상세 화면 구현"
```

---

## Task 8: 정리와 Phase 2 인수인계

**Files:**
- Create: `mobile/.env.example`, `README.md` (저장소 루트)
- Modify: `src/lib/api.ts` (주석 보강)

**Interfaces:**
- Consumes: 전체
- Produces: Phase 2 착수에 필요한 문서

- [ ] **Step 1: `.env.example` 생성**

```
# Phase 2에서 백엔드를 붙일 때 사용한다.
# 실제 값은 .env.local 에 넣는다 (git에 커밋하지 않는다).
EXPO_PUBLIC_API_URL=https://your-domain.example.com
```

- [ ] **Step 2: `.gitignore` 확인**

`.env.local`이 무시되는지 확인하고, 없으면 추가한다.

- [ ] **Step 3: `README.md` 작성**

```markdown
# Jenkins 빌드 알림 앱

Jenkins 빌드 결과를 푸시 알림으로 받고 이력을 조회하는 앱.

## 현재 상태

Phase 1 (모바일) 완료. 데이터는 mock이며 백엔드는 아직 없다.

## 개발 실행

Expo Go로는 푸시가 동작하지 않는다. Development Build가 폰에 설치되어 있어야 한다.

    cd mobile
    npx expo start --dev-client

Development Build 재생성이 필요한 경우 (네이티브 패키지를 추가했을 때):

    eas build --profile development --platform android

## 푸시 수동 테스트

1. 앱을 실행해 목록 화면 진입 (토큰이 자동 발급·등록됨)
2. 토큰이 필요하면 콘솔의 `[mock] registerDevice` 로그에서 확인
3. https://expo.dev/notifications 에서 발송
   - Data: `{"buildId":"my-service#42"}`
   - **Channel ID: `builds`** (누락하면 알림이 표시되지 않을 수 있음)

## Phase 2 착수 방법

1. `docs/superpowers/specs/2026-08-11-jenkins-build-notifier-design.md`의 API 계약대로 `server/`에 백엔드 구현
2. `mobile/.env.local`에 `EXPO_PUBLIC_API_URL` 설정
3. `mobile/src/lib/api.ts`의 `USE_MOCK`을 `false`로 변경
4. Jenkins Post-build에 `POST /api/builds` 호출 추가

앱 코드에서 수정할 곳은 `USE_MOCK` 한 줄뿐이다.

## 알림이 안 올 때

- 삼성 기기: `설정 > 배터리 > 백그라운드 사용 제한`에서 앱 제외
- 설정에서 "강제 중지"를 눌렀다면 앱을 한 번 실행해야 푸시가 재개된다
- 폰 알림 권한이 켜져 있는지 확인
```

- [ ] **Step 4: 🚩 검증 — 최종 타입 체크**

```bash
cd C:/Users/SSAFY/Desktop/notification/mobile
npx tsc --noEmit
```

에러가 없어야 한다.

- [ ] **Step 5: 커밋**

```bash
cd C:/Users/SSAFY/Desktop/notification
git add -A
git commit -m "docs: README 및 환경변수 예시 추가"
```

---

## Phase 1 완료 조건

아래가 모두 참이면 Phase 1이 끝난 것이다.

- [ ] 앱이 완전히 종료된 상태에서 푸시 알림이 폰 알림창에 도착한다
- [ ] 알림을 탭하면 해당 빌드의 상세 화면이 바로 열린다
- [ ] 목록 화면에 4개 mock 빌드가 상태별로 구분되어 표시된다
- [ ] pull-to-refresh가 동작한다
- [ ] 알림 권한을 거부해도 목록 화면은 정상 동작하고 배너가 표시된다
- [ ] `npx tsc --noEmit`이 통과한다
- [ ] `USE_MOCK` 한 줄과 환경변수만으로 실서버 전환이 가능한 구조다
