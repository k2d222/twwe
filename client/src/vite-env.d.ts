/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URLS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
