/**
 * Tailwind CSS v4는 PostCSS 플러그인이 `tailwindcss`가 아니라
 * `@tailwindcss/postcss`로 분리되었다.
 *
 * autoprefixer는 필요 없다 (Expo가 lightningcss를 쓴다).
 * postcss 자체는 Expo에 포함되어 있어 별도 설치가 필요 없다.
 */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
