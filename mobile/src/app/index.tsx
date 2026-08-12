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
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '700' }}>푸시 토큰</Text>

      {/* 1. 토큰 발급 처리 중 (로딩 상태) */}
      {reg === null && <Text>발급 중...</Text>}

      {/* 2. 토큰 발급 실패 시 (권한 거부, 에뮬레이터 환경, EAS projectId 미설정 등) */}
      {reg?.ok === false && (
        <View style={{ gap: 12 }}>
          <Text style={{ color: '#b91c1c' }}>{reg.message}</Text>
          <Button title="다시 시도" onPress={run} />
        </View>
      )}

      {/* 3. 토큰 발급 성공 시 토큰 표시 및 테스트 안내 */}
      {reg?.ok === true && (
        <View style={{ gap: 12 }}>
          {/* 토큰 박스: 클릭 시 클립보드로 복사 */}
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(reg.token);
              setCopied(true);
            }}
            style={{ backgroundColor: '#f3f4f6', padding: 12, borderRadius: 8 }}>
            <Text selectable style={{ fontFamily: 'monospace' }}>
              {reg.token}
            </Text>
          </Pressable>
          <Text style={{ color: '#6b7280' }}>{copied ? '복사됨' : '탭하면 복사됩니다'}</Text>

          {/* expo.dev/notifications 테스트 가이드 영역 */}
          <View style={{ backgroundColor: '#eff6ff', padding: 12, borderRadius: 8, gap: 4 }}>
            <Text style={{ fontWeight: '600' }}>expo.dev/notifications 에서 테스트</Text>
            <Text style={{ fontSize: 13, color: '#374151' }}>
              Data (JSON): {'{"buildId":"my-service#42"}'}
            </Text>
            <Text style={{ fontSize: 13, color: '#374151' }}>
              Channel ID: {BUILD_CHANNEL_ID}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

