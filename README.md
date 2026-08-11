# Jenkins 빌드 알림 앱

개인 서버의 Jenkins에서 빌드가 끝나면 핸드폰으로 푸시 알림을 받고, 앱에서 최근 빌드 이력을 확인한다.

React Native / Expo / 푸시 알림 파이프라인을 직접 만들어보는 학습 프로젝트다. 그래서 "Jenkins 플러그인으로 텔레그램에 웹훅 쏘기" 같은 최단 경로는 의도적으로 채택하지 않았다.

## 구조

```
Jenkins ──빌드 완료 시 POST──> 백엔드 ──> Expo Push ──> FCM ──> 폰 알림창
                                │
                                └─ 빌드 이력 저장
   RN 앱 ──HTTPS로 이력 조회────┘
```

알림을 표시하는 주체는 앱이 아니라 OS다. 앱이 종료된 상태에서도 알림이 도착하고, 알림을 탭하면 앱이 실행되며 해당 빌드 상세 화면이 열린다.

**백엔드를 두는 이유**: Jenkins도 REST API를 제공하므로 앱이 직접 조회할 수도 있지만, 그러려면 Jenkins 자격증명을 앱 바이너리에 심어야 한다. 폰에 심은 토큰은 유출된 것으로 취급해야 하므로 개인 서버 전체가 위험해진다. 푸시 토큰을 저장할 주체도 어차피 필요하다.

## 현재 상태

**Phase 1(모바일) 진행 중 — 8개 태스크 중 2개 완료.**

가장 불확실했던 부분(앱 종료 상태에서 푸시 수신)은 실기기에서 검증했다. 남은 작업은 UI 구현이다.

자세한 내용은 [`docs/STATUS.md`](docs/STATUS.md)를 참조한다.

## 기술 스택

| 역할 | 선택 |
|---|---|
| 앱 | TypeScript, Expo SDK 57, Expo Router |
| 스타일 | NativeWind, react-native-reusables |
| 서버 상태 | TanStack Query |
| 푸시 | expo-notifications → Expo Push Service → FCM |
| 빌드 | EAS Build (클라우드) |
| 패키지 매니저 | npm (고정) |

로컬 DB, 전역 상태관리 라이브러리는 쓰지 않는다. 이유는 [설계 문서](docs/superpowers/specs/2026-08-11-jenkins-build-notifier-design.md)의 "채택하지 않은 것" 절에 있다.

## 시작하기

**clone만으로는 실행되지 않는다.** Firebase 설정과 개인 환경변수가 git에 없기 때문이다.

전체 절차는 [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md)에 있다. 요약하면:

```bash
cd mobile
npm install
cp .env.example .env.local          # 값 채우기
eas login
# Firebase 프로젝트 생성 → google-services.json 배치 → FCM V1 키를 EAS에 업로드
eas build --profile development --platform android
npx expo start --dev-client
```

Expo Go로는 동작하지 않는다. Expo Go는 SDK 53부터 Android 원격 푸시를 지원하지 않으므로 development build가 필요하다.

## 문서

| 문서 | 내용 |
|---|---|
| [`docs/STATUS.md`](docs/STATUS.md) | 진행 상황, 남은 일, 확정한 결정과 삽질 기록 |
| [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) | 새 환경 설정 절차와 문제 해결 |
| [`docs/superpowers/specs/`](docs/superpowers/specs/) | 설계와 API 계약 |
| [`docs/superpowers/plans/`](docs/superpowers/plans/) | 구현 계획 (코드 전문, 명령어 레퍼런스 포함) |

## 디렉터리

```
.
├── docs/       설계, 계획, 운영 문서
├── mobile/     Expo 앱
└── server/     Phase 2에서 추가 예정
```

`mobile/`이라는 이름을 쓴 이유: Expo Router가 `app/`을 라우트 디렉터리로 사용하므로 프로젝트 폴더를 `app`으로 하면 `app/app/`이 되어 혼동을 일으킨다.
