import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Button, Pressable, ScrollView, Text, View } from 'react-native';

import { BUILD_CHANNEL_ID, registerForPushNotifications, type PushRegistration } from '@/lib/push';

/**
 * 메인 진입 화면 (Index Component)
 *
 * [현재 상태]
 * Phase 1 개발 초기의 푸시 알림 발급 및 수신 검증용 임시 테스트 화면입니다.
 * (Task 6 진행 시 빌드 목록 화면으로 대체될 예정입니다)
 *
 * [핵심 기능]
 * 1. 마운트 시 `registerForPushNotifications()` 호출하여 Expo Push Token 발급 시도
 * 2. 발급 상태(로딩 중 / 실패 / 성공)에 따른 UI 동적 렌더링
 * 3. 토큰 탭 시 클립보드 복사 (`expo-clipboard`) 기능
 * 4. `expo.dev/notifications`를 통한 푸시 발송 테스트용 가이드 및 채널 정보 안내
 *
 * [스타일 - Task 4]
 * NativeWind v5로 className을 사용합니다. metro.config.js의
 * globalClassNamePolyfill 기본값(true) 덕분에 일반 react-native 컴포넌트에
 * className을 바로 쓸 수 있습니다.
 *
 * 단 ScrollView의 `contentContainerClassName`은 전역 타입 확장에 포함되지 않습니다
 * (react-native-css/components의 ScrollView만 지원). 안쪽 View에 여백을 줍니다.
 */
export default function Index() {
  // reg: 푸시 알림 발급 결과 상태 (null: 로딩 중, PushRegistration: 성공 또는 실패 정보)
  const [reg, setReg] = useState<PushRegistration | null>(null);
  // copied: 클립보드 복사 완료 여부 상태
  const [copied, setCopied] = useState(false);

  /**
   * 푸시 토큰 발급 실행 함수
   * 기존 상태 초기화 후 push.ts의 registerForPushNotifications()를 호출하여 토큰을 획득합니다.
   */
  async function run() {
    setReg(null);
    setCopied(false);
    setReg(await registerForPushNotifications());
  }

  // 컴포넌트 마운트 시 토큰 발급 자동 실행
  useEffect(() => {
    run();
  }, []);

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="gap-4 p-6">
        <Text className="text-xl font-bold text-gray-900">푸시 토큰</Text>

        {/* 1. 토큰 발급 처리 중 (로딩 상태) */}
        {reg === null && <Text className="text-gray-700">발급 중...</Text>}

        {/* 2. 토큰 발급 실패 시 (권한 거부, 에뮬레이터 환경, EAS projectId 미설정 등) */}
        {reg?.ok === false && (
          <View className="gap-3">
            <Text className="text-red-700">{reg.message}</Text>
            <Button title="다시 시도" onPress={run} />
          </View>
        )}

        {/* 3. 토큰 발급 성공 시 토큰 표시 및 테스트 안내 */}
        {reg?.ok === true && (
          <View className="gap-3">
            {/* 토큰 박스: 클릭 시 클립보드로 복사 */}
            <Pressable
              onPress={async () => {
                await Clipboard.setStringAsync(reg.token);
                setCopied(true);
              }}
              className="rounded-lg bg-gray-100 p-3 active:opacity-60">
              <Text selectable className="font-mono text-gray-900">
                {reg.token}
              </Text>
            </Pressable>
            <Text className="text-gray-500">{copied ? '복사됨' : '탭하면 복사됩니다'}</Text>

            {/* expo.dev/notifications 테스트 가이드 영역 */}
            <View className="gap-1 rounded-lg bg-blue-50 p-3">
              <Text className="font-semibold text-gray-900">
                expo.dev/notifications 에서 테스트
              </Text>
              <Text className="text-sm text-gray-700">
                Data (JSON): {'{"buildId":"my-service#42"}'}
              </Text>
              <Text className="text-sm text-gray-700">Channel ID: {BUILD_CHANNEL_ID}</Text>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
