// Tailwind 스타일시트 로드. Metro가 이 import를 변환한다 (metro.config.js 참조).
// 앱 진입점에서 한 번만 import하면 전역에 적용된다.
import '../global.css';

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useEffect } from 'react';

/**
 * 앱 전역 최상위 레이아웃 (Root Layout)
 *
 * [역할 및 구조]
 * - Expo Router 기반의 전체 앱 내비게이션 트리 최상단 컴포넌트
 * - Stack 내비게이터를 사용해 각 화면(index, build/[id]) 간 카드 전환/헤더 제공
 * - 앱 전역에 한 번만 필요한 알림 설정을 여기서 수행 (Task 3)
 * - 전역 Tailwind 스타일시트 로드 (Task 4)
 *
 * [남은 작업]
 * - Task 6: TanStack Query Provider로 트리 감싸기
 */

/**
 * 포그라운드(앱이 화면에 떠 있는 상태) 알림 표시 정책.
 *
 * 기본 동작은 "표시하지 않음"이다. 앱을 보고 있는데 그 앱의 알림이 화면을 덮으면
 * 어색하기 때문이다. 다만 개발 중에는 앱을 켜놓고 테스트하다가
 * "알림이 안 온다"고 오진하게 되므로 표시하도록 바꾼다.
 *
 * SDK 57의 NotificationBehavior가 받는 필드는 아래 네 개와 priority뿐이다.
 * 구버전의 `shouldShowAlert`는 존재하지 않으므로 넣으면 타입 에러가 난다.
 * - shouldShowBanner: 화면 상단 배너로 띄울지
 * - shouldShowList: 알림창(알림 목록)에 남길지
 *
 * 컴포넌트 밖에 두는 이유: 전역 설정이므로 렌더마다 다시 호출할 필요가 없다.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  /**
   * 사용자가 탭한 마지막 알림을 돌려주는 훅.
   *
   * addNotificationResponseReceivedListener와 달리, 앱이 완전히 종료된 상태에서
   * 알림을 탭해 실행된 경우(콜드 스타트)도 포함해 결과를 준다. 리스너 방식은
   * 리스너가 등록되기 전에 이미 이벤트가 지나가 버려 콜드 스타트를 놓친다.
   *
   * 반환값 세 가지:
   * - undefined: 아직 판단이 끝나지 않음
   * - null: 탭한 알림이 없음
   * - NotificationResponse: 탭한 알림 정보
   */
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    const buildId = response?.notification.request.content.data?.buildId;
    if (typeof buildId !== 'string' || buildId.length === 0) return;

    /**
     * 객체 형태(pathname + params)로 넘긴다. 문자열로 `/build/${buildId}`를
     * 조립하면 buildId의 `#`(예: my-service#42)이 URL 프래그먼트 구분자로
     * 해석되어 뒷부분이 잘린다. 객체 형태는 Expo Router가 인코딩을 처리한다.
     */
    router.push({ pathname: '/build/[id]', params: { id: buildId } });
  }, [response]);

  return (
    <Stack>
      {/* 기본 진입 화면: 현재는 푸시 토큰 확인용, Task 6에서 빌드 목록으로 교체 */}
      <Stack.Screen name="index" options={{ title: '빌드' }} />
      <Stack.Screen name="build/[id]" options={{ title: '빌드 상세' }} />
    </Stack>
  );
}
