/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BACKEND_HOST: string
  readonly BACKEND_PORT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
