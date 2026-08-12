import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * 푸시 알림 등록 결과 타입 (Discriminated Union)
 */
export type PushRegistration =
  | { ok: true; token: string }
  | { ok: false; reason: 'not-device' | 'denied' | 'error'; message: string };

/** 
 * 백엔드 및 Expo Push Service 테스트(expo.dev/notifications) 시 지정해야 하는 Android 알림 채널 ID
 */
export const BUILD_CHANNEL_ID = 'builds';

/**
 * 실패 응답 객체를 일관되게 생성하는 헬퍼 함수
 */
const fail = (
  reason: 'not-device' | 'denied' | 'error',
  message: string
): PushRegistration => ({
  ok: false,
  reason,
  message,
});

/**
 * Android 8.0+ 필수: 알림 채널 생성
 */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(BUILD_CHANNEL_ID, {
    name: '빌드 결과',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/**
 * Expo 푸시 알림 토큰 발급 및 권한 요청 함수 (리팩토링 버전)
 */
export async function registerForPushNotifications(): Promise<PushRegistration> {
  // 1. 실기기 검증
  if (!Device.isDevice) {
    return fail('not-device', '푸시 알림은 실기기에서만 동작합니다. 에뮬레이터에서는 사용할 수 없습니다.');
  }

  // 2. Android 채널 생성
  await ensureChannel();

  // 3. 권한 확인 및 미승인 시 팝업 요청 (Logical OR로 간결화)
  const existing = await Notifications.getPermissionsAsync();
  const granted = existing.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) {
    return fail('denied', '알림 권한이 거부되었습니다. 설정에서 알림을 허용해주세요.');
  }

  // 4. EAS Project ID 검증
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    return fail('error', 'EAS projectId가 없습니다. `eas init`을 실행했는지 확인하세요.');
  }

  // 5. Expo Push Token 발급
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    return { ok: true, token: result.data };
  } catch (e) {
    return fail('error', `토큰 발급 실패: ${String(e)}`);
  }
}


