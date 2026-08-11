# 다른 환경에서 재현하기

이 저장소를 clone해도 **바로 실행되지 않는다.** git에 넣지 않은 파일이 있기 때문이다.
어떤 파일이 왜 빠져 있고 어떻게 얻는지 정리한다.

## git에 없는 파일

| 파일 | 성격 | 왜 제외했나 |
|---|---|---|
| `mobile/.env.local` | 개발자 개인 설정 | PC마다 IP가 다르다. 남의 IP가 들어오면 그 사람 환경이 깨진다 |
| `mobile/google-services.json` | Firebase 클라이언트 설정 | 비밀키는 아니지만(APK에 그대로 실린다) 각자 자기 Firebase 프로젝트를 쓰는 편이 맞다 |
| `*-firebase-adminsdk-*.json` | **Firebase 서비스 계정 키 (비밀)** | 이것만 있으면 누구든 내 앱 사용자 전체에게 알림을 보낼 수 있다 |
| `mobile/node_modules/` | 의존성 | `npm install`로 복원 |

`google-services.json`은 `.gitignore`에는 있지만 `.easignore`에는 **없다.** git 추적에서만 빠지고 EAS 빌드에는 정상적으로 업로드된다. 이 구분이 깨지면 빌드가 실패한다.

## 새 환경 설정 절차

### 1. 저장소와 의존성

```bash
git clone <저장소 URL>
cd <저장소>/mobile
npm install
```

패키지 매니저는 **npm으로 고정**한다. pnpm의 심볼릭 링크 구조는 Metro의 네이티브 모듈 해석에서 문제를 일으킨 이력이 있다.

### 2. EAS 프로젝트

```bash
npm install -g eas-cli
eas login
```

**기존 프로젝트를 이어서 쓰는 경우** — `app.json`의 `extra.eas.projectId`가 이미 있고 그 Expo 계정에 접근 권한이 있으면 아무것도 하지 않는다.

**새로 시작하는 경우** — `app.json`에서 `extra.eas.projectId`를 지우고 `eas init`을 실행해 새 ID를 발급받는다. 이 값 없이는 푸시 토큰을 발급할 수 없다.

### 3. Firebase (Android 푸시에 필수)

이 단계를 빠뜨리면 **토큰은 정상 발급되는데 알림만 오지 않는다.** 가장 찾기 어려운 실패 유형이다.

Expo Push Service를 쓰더라도 Android 전달은 FCM을 거치고, Expo가 내 앱에 밀어넣으려면 내 Firebase 자격증명이 필요하다.

1. https://console.firebase.google.com 에서 프로젝트 생성 (Analytics 불필요)
2. Android 앱 추가. 패키지 이름은 `app.json`의 `expo.android.package`와 **정확히 일치**해야 한다

   ```
   com.kkh.mobile
   ```

   한 글자라도 다르면 알림이 전달되지 않는다.
3. `google-services.json`을 내려받아 `mobile/google-services.json`으로 저장한다. 이어지는 "SDK 추가", "Gradle 설정" 안내는 **모두 건너뛴다** — Expo가 처리한다.
4. `app.json`의 `android.googleServicesFile`이 `"./google-services.json"`인지 확인한다.
5. Firebase 콘솔 → 프로젝트 설정(⚙️) → **서비스 계정** → "새 비공개 키 생성" → JSON 다운로드.
   ⚠️ 이 파일은 비밀키다. 저장소 폴더 **밖**에 둔다.
6. EAS에 업로드한다.

   ```bash
   eas credentials
   # Android → development → Google Service Account
   # → Manage your Google Service Account Key for Push Notifications (FCM V1)
   # → Set up a Google Service Account Key → 5번 파일 경로 입력
   ```
7. 확인: `eas credentials`를 다시 실행해 `Push Notifications (FCM V1)`에 키가 표시되면 성공이다.
   `None assigned yet`이면 아직 안 된 것이다.

### 4. 개발 서버 접속 설정

```bash
cp .env.example .env.local
```

폰과 PC가 같은 WiFi에 있고 AP 격리가 없다면 `REACT_NATIVE_PACKAGER_HOSTNAME`을 비워도 된다.

**교육기관·사내 WiFi이거나 폰이 LTE인 경우** 사설 IP로는 접근이 불가능하다. Tailscale을 쓴다.

1. PC와 폰 양쪽에 Tailscale 설치, 같은 계정으로 로그인
2. **폰에서 Tailscale 연결을 켠다.** 꺼져 있으면 `Connecting to the development server...`에서 멈춘다
3. PC 주소 확인: `tailscale status`에서 이 PC의 `100.x.y.z`
4. `.env.local`에 기입

   ```
   REACT_NATIVE_PACKAGER_HOSTNAME=100.79.222.81
   ```

`ipconfig`의 `vEthernet (...)` 계열 주소(`172.x`)는 Hyper-V/WSL 전용 가상 네트워크다. 접속 대상이 아니다.

대안: `npx expo start --dev-client --tunnel` (ngrok 경유, 느림) 또는 PC를 폰 핫스팟에 연결.

### 5. Development Build

Expo Go로는 원격 푸시가 동작하지 않으므로 development build가 필요하다.

```bash
cd mobile
eas build --profile development --platform android
```

15~20분 걸린다. 완료되면 링크/QR로 폰에 APK를 설치한다.

**빌드 전에 네이티브 모듈이 모두 설치되어 있어야 한다.** 나중에 추가하면 재빌드해야 한다. 현재 필요한 것은 `expo-notifications`, `expo-clipboard`이며 `package.json`에 이미 있다.

### 6. 실행

```bash
npx expo start --dev-client
```

시작 시 다음이 출력되면 `.env.local`이 정상 로드된 것이다.

```
env: load .env.local
env: export REACT_NATIVE_PACKAGER_HOSTNAME
```

폰에서 development build 앱을 열고 QR을 스캔한다. 첫 번들링은 오래 걸린다.

### 7. 검증

앱을 **완전히 종료**한 상태에서 https://expo.dev/notifications 로 알림을 보낸다.

| 항목 | 값 |
|---|---|
| Expo push token | 앱 화면의 `ExponentPushToken[...]` 전체 |
| Title | `✅ my-service #42` |
| Body | `main · 2m 13s` |
| Data (JSON) | `{"buildId":"my-service#42"}` |
| **Channel ID** | **`builds`** |

Channel ID를 비우면 알림이 표시되지 않을 수 있다.

## 문제 해결

| 증상 | 원인 |
|---|---|
| `Connecting to the development server...`에서 멈춤 | 폰 Tailscale이 꺼져 있거나, dev client가 예전 IP를 기억하고 있다. 앱에서 URL 직접 입력: `http://100.x.y.z:8081` |
| 토큰은 나오는데 알림이 안 옴 | FCM V1 키 미등록(3-6단계) 또는 `google-services.json` 추가 후 재빌드 안 함 |
| 응답에 `MismatchSenderId` / `InvalidCredentials` | FCM 자격증명 문제 확정 |
| `EAS projectId가 없습니다` | `app.json`에 `extra.eas.projectId`가 없다. `eas init` 실행 |
| `실기기에서만 동작합니다` | 에뮬레이터로 실행 중. 푸시는 실기기만 가능 |
| 설정 파일을 고쳤는데 반영 안 됨 | Metro 캐시. `npx expo start --dev-client --clear` |
| 며칠 뒤 알림이 끊김 | 삼성 배터리 최적화. `설정 > 배터리 > 백그라운드 사용 제한`에서 제외 |
| 강제 중지 후 알림 안 옴 | Android 정책. 앱을 한 번 실행하면 재개된다 |
| EAS 빌드가 `EPERM ... symlink`로 실패 | 저장소 루트의 `.easignore`가 `.agents/`, `.claude/`를 제외하는지 확인 |

## Phase 2 (백엔드) 준비

`mobile/.env.local`에 한 줄 추가하고 `mobile/src/lib/api.ts`의 `USE_MOCK`을 `false`로 바꾸면 실서버에 연결된다.

```
EXPO_PUBLIC_API_URL=https://your-domain.example.com
```

`EXPO_PUBLIC_` 접두사가 붙은 값은 **JS 번들에 문자열로 박힌다.** APK를 뜯으면 보이므로 비밀값을 넣지 않는다.
