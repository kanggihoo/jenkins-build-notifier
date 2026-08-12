const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

/**
 * Metro 설정 — NativeWind v5 (Tailwind CSS v4)
 *
 * [주의]
 * - 함수명은 `withNativewind` (소문자 w). `withNativeWind`는 deprecated다.
 * - v4의 `{ input: './global.css' }` 옵션은 없다. CSS 파일은 앱에서 직접 import하고
 *   Metro가 `.css` import를 변환한다. (src/app/_layout.tsx 참조)
 *
 * [옵션]
 * - inlineVariables: false
 *   CSS 변수를 인라인으로 펼치지 않는다. 인라인하면 PlatformColor를 CSS 변수로
 *   쓸 때 깨진다. 지금 PlatformColor를 쓰진 않지만 기본값으로 둘 이유가 없다.
 * - globalClassNamePolyfill은 지정하지 않는다.
 *   withNativewind의 기본값이 true이며, 이 값이 true면 일반 React Native
 *   컴포넌트(View, Text, ...)에 className을 바로 쓸 수 있다.
 *   false로 두면 react-native-css/components의 래핑된 컴포넌트만 className을
 *   받으므로 import 경로를 전부 바꿔야 한다. 화면 2개짜리 앱에서 얻을 것이 없다.
 */
const config = getDefaultConfig(__dirname);

module.exports = withNativewind(config, {
  inlineVariables: false,
});
