import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

/**
 * 빌드 상세 화면 (임시 버전)
 *
 * [현재 상태]
 * Task 3의 알림 탭 → 상세 화면 라우팅을 검증하기 위한 껍데기 화면입니다.
 * (Task 7 진행 시 실제 빌드 정보를 표시하는 화면으로 대체될 예정입니다)
 *
 * [확인 목적]
 * 1. 앱이 완전히 종료된 상태에서 알림을 탭했을 때(콜드 스타트) 이 화면이 열리는지
 * 2. 푸시 페이로드의 `data.buildId`가 라우트 파라미터로 온전히 전달되는지
 *    - buildId는 `my-service#42` 형태로 `#`을 포함한다. URL 경로에서 `#`은
 *      프래그먼트 구분자이므로 잘릴 위험이 있어, 보내는 쪽에서 객체 형태로 넘긴다.
 *    - `useLocalSearchParams`는 디코딩된 값을 돌려주므로 여기서는 그대로 쓴다.
 */
export default function BuildDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View className="flex-1 gap-2 bg-white p-6">
      <Text className="text-lg font-bold text-gray-900">상세 화면</Text>
      <Text selectable className="font-mono text-gray-900">
        buildId: {id}
      </Text>
      <Text className="text-sm text-gray-500">
        이 값이 발송 시 넣은 buildId와 일치하면 라우팅이 정상입니다.
      </Text>
    </View>
  );
}
