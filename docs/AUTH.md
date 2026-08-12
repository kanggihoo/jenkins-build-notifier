# 인증 설계

최종 갱신: 2026-08-12

한 명의 사용자가 웹과 모바일 앱에서 동시에 접속하는 상황을 전제로 한 인증 설계다.
구글 OAuth로만 로그인하고, 세션은 Redis에 두고, 웹은 쿠키·모바일은 Bearer 헤더로 세션 키를 나른다.

## 결론 요약

| 항목 | 선택 |
|---|---|
| 계정 생성 | 구글 OAuth 전용. 자체 회원가입 없음 |
| 세션 방식 | Redis 불투명 토큰 (JWT 아님) |
| 세션 키 전달 | 웹 = HttpOnly 쿠키 / 모바일 = SecureStore + `Authorization: Bearer` |
| 세션 단위 | **기기 단위.** 한 사용자에 여러 세션 |
| OAuth 처리 주체 | **백엔드.** 앱과 브라우저는 OAuth를 모른다 |
| grant | Authorization Code + PKCE |

---

## 1. 왜 JWT가 아닌가

`JWT + Refresh Token` 구조를 먼저 검토했으나 지금 규모에서는 비용만 크다.

Redis 조회 0.2ms를 아끼는 게 문제가 아니다. JWT를 쓰면 Access Token이 짧아야 하고,
짧으니 Refresh가 필요하고, Refresh 때문에 아래가 전부 딸려온다.

```
AT / RT 두 개의 수명 튜닝
RT rotation + 재사용 감지
클라이언트 401 인터셉터 + 재시도
single-flight (동시 401 폭주 방어)   ← 모바일 인증 버그의 절반이 여기서 나온다
RT 전용 쿠키 설정
refresh 실패 시 로그아웃 분기
```

불투명 세션에서 이 전부를 대체하는 것은 `EXPIRE` 한 줄이다.

| | 불투명 세션 | JWT only | 세션 + JWT |
|---|---|---|---|
| 요청당 조회 | 1회 (~0.2ms) | 없음 | 없음 / 1회 |
| 즉시 폐기 | 공짜 | 불가 | 부분적 |
| Refresh 로직 | **불필요** | 필요 | 필요 |
| 구현 코드량 | 최소 | 중 | **최대** |

`세션 + JWT` 혼합형은 둘의 복잡도를 합치고 장점은 절반만 가져간다.
서버 여러 대 + 높은 RPS일 때만 정당화된다.

### 나중에 JWT로 갈아타기 쉽다

클라이언트 계약이 동일하다. 클라이언트는 "받은 문자열을 되돌려준다"만 하고,
그 문자열이 랜덤인지 JWT인지 모른다. 서버 내부 구현만 바꾸면 되고 앱 재배포도 필요 없다.

갈아탈 신호:

- 서버 2대 이상 + Redis가 원격이라 왕복이 1ms를 넘는다
- 마이크로서비스로 쪼개져 서비스마다 토큰을 독립 검증해야 한다
- Redis 장애 시에도 읽기 API는 살아있어야 한다 (지연이 아니라 **가용성**이 진짜 이유다)

서비스가 쪼개질 때도 JWT가 첫 선택은 아니다. **게이트웨이가 한 번만 검증하고
내부는 `X-User-Id` 헤더를 신뢰**하는 구조가 먼저다. 인증이 한 곳에만 있으니
정책 변경도 한 곳이다.

---

## 2. 세션은 캐시가 아니다

설계에서 가장 중요한 구분이다.

```
"랜덤 문자열 a1b2c3 을 가진 사람은 user 42 다"
        ↑ 이 사실은 DB에 없다. Redis에만 존재한다.
```

DB에는 `users` 테이블에 42번 사용자가 있을 뿐, 누가 언제 로그인해서 어떤 토큰을 받았는지는 없다.
**세션은 원본(source of truth)이다.** 캐시는 사라져도 원본에서 재구성할 수 있는 것이지만,
세션에는 재구성할 원본이 없다.

따라서:

> 세션이 사라지면 → 그 로그인은 존재하지 않게 된 것이다 → **재로그인.**
> DB를 뒤져서 복구하는 게 아니다.

Redis 키를 두 종류로 분리해 이 성질 차이를 유지한다.

| | `sess:*` | `user:*` (아직 만들지 않음) |
|---|---|---|
| 정체 | 원본 상태 | DB의 사본 |
| 사라지면 | 재로그인 | DB에서 재구성 |
| 무효화 시점 | 로그아웃 | 프로필·권한 변경 |
| 필요성 | 필수 | **선택. 지금은 만들지 않는다** |

세션에는 `userId`만 넣고 `role`이나 프로필은 넣지 않는다.
넣으면 그 부분이 DB의 캐시가 되어 권한 변경이 세션 수명만큼 지연된다.
`userId` → users PK 조회는 1~2ms라 캐시할 이유가 없다.

---

## 3. 전체 구조

```
                          ┌─────────────────────────┐
   웹 브라우저 ──쿠키────→ │                         │
                          │        백엔드           │──→ Redis (세션 원본)
   모바일 앱 ──Bearer───→  │  토큰 추출 한 줄로 통합  │
                          │                         │──→ DB (사용자 원본)
                          └─────────────────────────┘
                                       ↑
                          연결점은 세션 안의 userId 하나
```

서버는 두 곳에서 토큰을 꺼내면 되고, 이 아래 모든 코드는 차이를 모른다.

```ts
const token = req.cookies.sid ?? req.headers.authorization?.slice(7);
```

한 사용자 = N개 세션. 웹 하나, 아이폰 하나, 아이패드 하나면 세션 3개가 독립적으로 존재한다.

```
user 42
├─ 세션 A  web    (쿠키)
├─ 세션 B  ios    (SecureStore)
└─ 세션 C  android
```

---

## 4. Redis 스키마

```
sess:{sha256(token)}                Hash,  TTL = IDLE_SEC (요청마다 갱신)
  ├─ userId      "42"               ← DB로의 포인터. 유일한 DB 연결점
  ├─ deviceId    "d-a1b2c3"
  ├─ platform    "ios" | "android" | "web"
  ├─ createdAt   "1754960000000"    ← 절대 상한 판정용
  ├─ authTime    "1754960000000"    ← step-up 재인증 판정용
  └─ pushToken   "ExponentPushToken[...]"   ← 로그아웃 시 함께 정리

user:{userId}:sess                  ZSet,  기기 목록 (전체 로그아웃용)
  member = sha256(token)
  score  = createdAt + ABSOLUTE_MAX  ← 절대 만료 시각. 갱신 불필요

oauth_state:{state}                 String, TTL 600s   ← PKCE verifier + client 종류
oauth_code:{code}                   String, TTL 30s    ← 모바일 1회용 교환 코드
```

### 설계 근거

**토큰을 해시해서 키로 쓴다.** Redis 덤프나 `MONITOR` 로그가 유출돼도 토큰을 그대로 쓸 수 없다.
`sha256()` 한 줄이라 비용이 없다.

**ZSet score = 절대 만료 시각.** 슬라이딩 갱신 때 score를 건드리지 않아도 되므로
요청당 쓰기가 늘지 않는다.

**푸시 토큰을 세션에 둔다.** 로그아웃 시 세션 키를 지우면 푸시 등록도 함께 정리된다.
기기를 공유하는 상황에서 로그아웃한 사용자에게 알림이 계속 가는 사고를 막는다.

### 상수

| 이름 | 값 | 의미 |
|---|---|---|
| `IDLE_SEC` | 14일 | 마지막 요청 이후 이 시간이 지나면 만료 |
| `ABSOLUTE_MAX_MS` | 90일 | 활동과 무관한 절대 상한 |

---

## 5. 로그인 흐름

OAuth는 **"누구인지 알아내는 단계"만 교체**한다. 그 뒤 세션 발급은 웹·모바일이 동일하다.

```
구글이 "이 사람 42번" 확인 ──→ 세션 생성 ──→ 전달 방식만 분기
```

백엔드가 confidential client이므로 **PKCE 로직은 백엔드에 한 벌만 존재**한다.
앱과 브라우저는 OAuth 참여자가 아니고 브라우저를 여는 역할만 한다.

### 웹

```
1. 브라우저 → GET /auth/google
2. 백엔드: state + PKCE verifier 생성 → oauth_state 에 저장 → 구글로 302
3. 사용자 로그인 / 동의
4. 구글 → GET /auth/google/callback?code=...&state=...
5. 백엔드: state 검증 → code + verifier 로 토큰 교환 → 사용자 조회/생성
6. 백엔드: 세션 생성 → Set-Cookie → 302 /
```

```
Set-Cookie: sid=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=...
```

### 모바일

리다이렉트 개념은 모바일에도 있다. **딥링크**가 그것이다.

| | 웹 | 모바일 |
|---|---|---|
| 리다이렉트 대상 | `https://ours.com/callback` | `ourapp://auth/callback` |
| 누가 처리 | 브라우저가 URL 이동 | **OS가 스킴을 보고 앱을 깨운다** |
| 결과 | 같은 탭에서 전환 | 브라우저가 닫히고 앱이 포그라운드로 |

브라우저는 앱 위에 모달로 띄운다. 크롬 앱을 밖으로 실행하는 게 아니다.

- iOS → `ASWebAuthenticationSession`
- Android → Chrome Custom Tabs

`expo-web-browser`의 `openAuthSessionAsync` 하나로 둘 다 처리된다. **이미 설치되어 있다.**
시스템 브라우저라서 사파리·크롬의 로그인 쿠키를 공유한다. 이미 구글에 로그인돼 있으면 탭 한 번으로 끝난다.

WebView에 구글 로그인 폼을 띄우는 것은 **구글이 차단한다**(`disallowed_useragent`). 시도할 필요가 없다.

```
1. 앱: openAuthSessionAsync(`${API}/auth/google?client=mobile`, 'ourapp://auth/callback')
2~5. 웹과 완전히 동일한 백엔드 코드
6. 백엔드: 세션 생성 → 1회용 code 발급 → 302 ourapp://auth/callback?code=<code>
7. OS가 브라우저를 닫고 앱을 깨운다. openAuthSessionAsync 가 URL을 반환
8. 앱: POST /auth/exchange { code } → 세션 토큰 → SecureStore 저장
```

앱 코드 전부:

```ts
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';

export async function signInWithGoogle() {
  const res = await WebBrowser.openAuthSessionAsync(
    `${API}/auth/google?client=mobile`,
    'ourapp://auth/callback',
  );
  if (res.type !== 'success') return;

  const code = new URL(res.url).searchParams.get('code')!;
  const { token } = await fetch(`${API}/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  }).then(r => r.json());

  await SecureStore.setItemAsync('session', token);
}
```

`expo-auth-session`, `expo-crypto` 는 필요 없다. PKCE를 백엔드가 하기 때문이다.

### 서버는 마지막 한 줄만 분기한다

```ts
const token = await createSession(user, req);

if (state.client === 'mobile') {
  const code = crypto.randomBytes(32).toString('base64url');
  await redis.set(`oauth_code:${code}`, token, 'EX', 30);
  return res.redirect(`ourapp://auth/callback?code=${code}`);
}
res.cookie('sid', token, COOKIE_OPTS);
return res.redirect('/');
```

### 왜 세션 토큰을 직접 넘기지 않는가

커스텀 스킴은 **다른 앱이 같은 스킴을 등록해 가로챌 수 있다**(특히 Android).
`ourapp://auth/callback?token=<세션토큰>` 을 그대로 보내면 악성 앱이 세션을 훔친다.

1회용 code는 30초 안에 한 번만 교환되므로 가로채도 정상 앱이 먼저 쓰면 무효다.

```ts
// GETDEL 이 원자적으로 읽고 삭제한다 → 1회용 보장
const token = await redis.getdel(`oauth_code:${code}`);
if (!token) throw new Unauthorized();
```

Universal Links(`https://ours.com/auth/callback`)를 쓰면 스킴 하이재킹이 원천 차단되지만
도메인 + AASA 파일 호스팅 설정이 필요하다. 1회용 code가 더 싸게 같은 문제를 해결한다.

### Device Authorization Grant 는 쓰지 않는다

RFC 8628(device flow)은 스마트TV·CLI·IoT처럼 **브라우저가 없거나 입력이 불편한 기기**용이다.
모바일 앱은 시스템 브라우저를 열 수 있으므로 해당하지 않는다.

- 사용자가 코드를 다른 기기에 옮겨 적어야 한다 → UX가 훨씬 나쁘다
- 폴링이 필요하다
- provider가 device flow에서 scope를 좁게 제한하는 경우가 있다

**RFC 8252 (OAuth 2.0 for Native Apps)** 가 네이티브 앱에 권고하는 것은
Authorization Code + PKCE + 시스템 브라우저다. 위 설계가 그 표준이다.

---

## 6. 세션 검증

모든 요청에서 검증한다. 조회와 슬라이딩 갱신을 왕복 1회로 합친다.

```ts
const KEY = (t: string) => `sess:${sha256(t)}`;

export async function authenticate(req) {
  const token = req.cookies.sid ?? req.headers.authorization?.slice(7);
  if (!token) throw new Unauthorized();

  const [sess] = await redis.multi()
    .hgetall(KEY(token))
    .expire(KEY(token), IDLE_SEC)
    .exec();

  if (!sess?.userId) throw new Unauthorized();
  if (Date.now() - +sess.createdAt > ABSOLUTE_MAX_MS) throw new Unauthorized();

  return { userId: +sess.userId, sess };
}
```

**"일반 API / 민감 API" 경계를 두지 않는다.** 모든 요청이 조회하므로 무효화가 0초 안에 반영되고,
민감 목록 관리에서 누락이 생기는 문제가 아예 발생하지 않는다.

민감한 작업에만 추가로 붙이는 것은 **step-up 재인증** 하나다.

```ts
// 결제, 계정 삭제 등
if (Date.now() - +sess.authTime > 5 * 60_000) throw new ReauthRequired();
```

세션이 탈취되어도 재인증을 통과할 수 없으므로, 탈취 창의 길이와 무관하게 막힌다.

---

## 7. 로그아웃

세 가지 경로 모두 Redis 키 삭제로 끝난다.

### 사용자 로그아웃 (현재 기기)

```ts
await redis.multi()
  .del(KEY(token))
  .zrem(`user:${userId}:sess`, sha256(token))
  .exec();
// 웹: Set-Cookie 로 쿠키 삭제 / 모바일: SecureStore 삭제
```

### 특정 기기 로그아웃

기기 목록을 보여주고 고른 세션만 지운다. 죽은 항목은 조회 시 정리한다.

```ts
const key = `user:${userId}:sess`;
await redis.zremrangebyscore(key, 0, Date.now());   // 절대 만료분 청소
const hashes = await redis.zrange(key, 0, -1);
// idle 만료된 항목은 EXISTS 로 걸러낸다 (기기 수가 적어 파이프라인 1회로 충분)
```

### 전체 로그아웃 (강제 탈퇴, 계정 이상 등)

```ts
const hashes = await redis.zrange(`user:${userId}:sess`, 0, -1);
await redis.multi()
  .del(...hashes.map(h => `sess:${h}`))
  .del(`user:${userId}:sess`)
  .exec();
```

즉시 반영된다. 모든 요청이 세션을 조회하므로 다음 요청부터 401이다.

---

## 8. DB 스키마

```
users
  id
  email
  password_hash   NULL 허용     ← OAuth 전용이라 지금은 항상 NULL
  created_at

oauth_accounts
  provider            'google'
  provider_user_id                ← 구글의 sub
  user_id
  UNIQUE(provider, provider_user_id)
```

### 매칭 기준은 이메일이 아니라 `provider_user_id` 다

사용자가 구글 계정 이메일을 바꿔도 같은 계정으로 인식된다.

### 이메일로 자동 연결하면 취약점이 된다

지금은 구글 하나뿐이라 발생하지 않지만, provider를 추가할 때 반드시 지켜야 한다.

```
공격자가 victim@gmail.com 으로 계정 생성
      ↓
피해자가 구글 로그인
      ↓
서버가 "이메일이 같네" 하고 기존 계정에 연결
      ↓
공격자가 피해자 계정에 접근 가능
```

provider가 준 `email_verified === true` 일 때만 연결하고, 아니면 별도 계정으로 둔다.

### `password_hash` 를 nullable로 두는 이유

나중에 자체 로그인을 추가할 때 마이그레이션 없이 로그인 경로만 하나 더 만들면 된다.
지금 컬럼을 두는 비용이 0이다.

---

## 9. 보안 항목

자체 회원가입을 없앴으므로 비밀번호 해싱, 재설정 플로우, 이메일 인증,
로그인 rate limit이 전부 불필요해졌다. 로그인 시도 제한은 구글이 대신 한다.

남는 항목은 짧다.

| 항목 | 내용 |
|---|---|
| HTTPS + HSTS | `Secure` 플래그가 의미를 가지려면 필수 |
| CSRF | 일반 API는 Bearer 헤더라 대상이 아니다. 쿠키를 쓰는 웹은 `SameSite=Lax` 로 충분 |
| `state` 파라미터 | OAuth CSRF 방어. PKCE와 별개로 필요하다 |
| XSS | React가 자동 이스케이프한다. 아래 3종만 확인 |
| 로그 마스킹 | `Authorization` 헤더와 `Cookie` 를 로거·Sentry에서 마스킹. **실제로 가장 흔한 유출 경로다** |
| 세션 고정 | 로그인마다 새 토큰을 발급하므로 자동으로 막힌다. 추가 작업 없음 |

XSS 확인 항목:

```bash
grep -rn "dangerouslySetInnerHTML" src/    # 0건이거나 sanitize 통과
grep -rn "href={" src/                     # 사용자 입력이면 javascript: 스킴 검사
grep -rn "eval\|new Function" src/         # 0건
```

응답 헤더 한 줄로 유출 경로를 끊는다.

```
Content-Security-Policy: connect-src 'self'
```

### 하지 않는 것

| | 이유 |
|---|---|
| IP 주소 바인딩 | 모바일은 LTE↔WiFi 전환마다 IP가 바뀐다. 정상 사용자를 계속 로그아웃시킨다 |
| User-Agent 바인딩 | 공격자가 복사하면 된다. 방어 효과 ≈ 0, 브라우저 업데이트 시 로그아웃 |
| 동시 세션 수 제한 | 요구사항이 아니면 UX만 나빠진다 |
| 2FA | 구글이 이미 한다 |

---

## 10. 설정

```json
// mobile/app.json
{ "expo": { "scheme": "ourapp" } }
```

`expo-linking`, `expo-web-browser`, `expo-dev-client` 는 이미 설치되어 있다.
추가 설치가 필요한 것은 `expo-secure-store` 하나다.

```bash
npx expo install expo-secure-store
```

커스텀 스킴은 Expo Go에서 동작하지 않는다. **dev client로 테스트해야 한다.**

Redis는 기본 상태로 재시작 시 전원 로그아웃이다. 받아들이기 어려우면 설정 한 줄로 해결한다.

```
appendonly yes    # AOF. 재시작해도 세션 유지
```

세션을 DB에 이중 저장하지 않는다. 쓰기가 두 곳이 되고, 얻는 것은 AOF가 하는 일과 같다.

---

## 11. 열린 항목

| 항목 | 내용 | 시점 |
|---|---|---|
| 백엔드 스택 | 아직 미정. 이 저장소에는 모바일만 있다 | 구현 착수 전 |
| 카카오 로그인 | 한국 사용자 대상이면 전환율 차이가 크다 | 선택 |
| `user:{id}` 캐시 | users PK 조회가 부하로 보일 때 | 나중 |
| 게이트웨이 패턴 | 서비스가 2개 이상으로 쪼개질 때 | 나중 |
| 내부용 단명 JWT | 서비스가 5개 이상 | 나중 |
| Universal Links | 스킴 하이재킹이 더 걱정될 때 | 나중 |
| Sign in with Apple | **iOS 스토어 제출을 안 하기로 했으므로 불필요.** App Store 심사 4.8은 소셜 로그인을 유일한 계정 생성 수단으로 쓸 때 동등한 옵션을 요구한다. TestFlight 외부 테스터 배포도 심사 대상이니, 그 방향으로 바뀌면 재검토한다 | 방향 전환 시 |
| DPoP | 금융 규제 수준 요구가 생길 때 | 아마 안 함 |

---

## 12. 구현 순서

```
1. 백엔드 스택 결정
2. Redis 준비 (docker-compose 로컬)
3. DB: users, oauth_accounts 테이블
4. GET  /auth/google              state + PKCE 생성, 구글로 302
5. GET  /auth/google/callback     code 교환, 사용자 조회/생성, 세션 생성, 웹/모바일 분기
6. POST /auth/exchange            모바일 1회용 code → 세션 토큰
7. authenticate 미들웨어          모든 라우트에 적용
8. POST /auth/logout              현재 기기
9. 모바일: signInWithGoogle + SecureStore + fetch 래퍼
10. 모바일: 로그인 상태 3단계(loading | signedIn | signedOut) → 라우트 게이팅
11. 로그인 성공 후 푸시 토큰 등록 → 세션에 저장
```

10번에서 상태를 `signedIn | signedOut` 두 개로 모델링하면 SecureStore 읽기가 비동기라
스플래시에서 로그인 화면이 깜빡 보이는 버그가 생긴다. **`loading` 이 반드시 필요하다.**

11번을 빠뜨리면 익명 상태에서 발급한 푸시 토큰이 어느 사용자 것인지 알 수 없어
알림을 보낼 대상을 특정할 수 없다.
