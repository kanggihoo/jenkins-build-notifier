import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Button, Pressable, ScrollView, Text, View } from 'react-native';

import { BUILD_CHANNEL_ID, registerForPushNotifications, type PushRegistration } from '@/lib/push';

// Task 6에서 빌드 목록 화면으로 교체된다. 지금은 토큰 확인용 임시 화면이다.
export default function Index() {
  const [reg, setReg] = useState<PushRegistration | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    setReg(null);
    setCopied(false);
    setReg(await registerForPushNotifications());
  }

  useEffect(() => {
    run();
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '700' }}>푸시 토큰</Text>

      {reg === null && <Text>발급 중...</Text>}

      {reg?.ok === false && (
        <View style={{ gap: 12 }}>
          <Text style={{ color: '#b91c1c' }}>{reg.message}</Text>
          <Button title="다시 시도" onPress={run} />
        </View>
      )}

      {reg?.ok === true && (
        <View style={{ gap: 12 }}>
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
