import { Stack } from 'expo-router';

// Task 3에서 알림 핸들러와 탭 라우팅을 이 파일에 추가한다.
export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: '빌드' }} />
    </Stack>
  );
}
