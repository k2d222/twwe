/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URLS: string
  readonly VITE_SHOW_CURSORS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
