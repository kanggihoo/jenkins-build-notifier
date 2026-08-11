import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type PushRegistration =
  | { ok: true; token: string }
  | { ok: false; reason: 'not-device' | 'denied' | 'error'; message: string };

/** 발송 시 지정할 채널 ID. 백엔드와 expo.dev/notifications에서 같은 값을 써야 한다. */
export const BUILD_CHANNEL_ID = 'builds';

/**
 * Android 8.0+ 에서는 알림이 반드시 채널에 속해야 한다.
 * 채널이 없으면 알림이 무시되거나 소리 없이 상태바에만 들어간다.
 * importance MAX 여야 화면 상단에 팝업(heads-up)으로 뜬다.
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

export async function registerForPushNotifications(): Promise<PushRegistration> {
  if (!Device.isDevice) {
    return {
      ok: false,
      reason: 'not-device',
      message: '푸시 알림은 실기기에서만 동작합니다. 에뮬레이터에서는 사용할 수 없습니다.',
    };
  }

  await ensureChannel();

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.granted;
  }
  if (!granted) {
    return {
      ok: false,
      reason: 'denied',
      message: '알림 권한이 거부되었습니다. 설정에서 알림을 허용해주세요.',
    };
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    return {
      ok: false,
      reason: 'error',
      message: 'EAS projectId가 없습니다. `eas init`을 실행했는지 확인하세요.',
    };
  }

  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    return { ok: true, token: result.data };
  } catch (e) {
    return {
      ok: false,
      reason: 'error',
      message: `토큰 발급 실패: ${String(e)}`,
    };
  }
}
