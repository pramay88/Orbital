# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
# Orbital media format support

Orbital uses server-provided MIME metadata and a small file-signature check.
Playback compatibility is also verified in the browser before Video.js or native
media elements are used.

## Supported previews

- Images: JPEG, PNG, GIF, WebP and AVIF in browsers that support the format.
- PDF: Browser PDF viewer.
- Text: TXT, Markdown, CSV, JSON and XML; rendered as text only.
- Audio: MP3, M4A, WAV, OGG, FLAC and AAC where supported by the browser.
- Video: MP4 and WebM containers are candidates for Video.js playback.
  OGV is only enabled when the browser reports support.

## Format limitations

- MKV and AVI are not assumed playable. Their codecs vary and require a
  compatible browser codec or future transcoding.
- MOV is not enabled as a browser-compatible format.
- MP4 codec support depends on the browser and operating system. Video.js
  additionally checks browser capability for the common AVC/H.264 + AAC codec
  combination.
- FLAC, AAC and some OGG codecs are browser-dependent.
- Unsupported files offer Download. Future transcoding must use the media route
  and must not replace direct Range streaming.

HTTP Range requests are required for seeking and efficient playback. Orbital
does not load complete media files into memory.
