/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly WEBSOCKET_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
