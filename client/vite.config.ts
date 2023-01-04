import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import sveltePreprocess from 'svelte-preprocess'
import seqPreprocessor from 'svelte-sequential-preprocessor'
import importAssets from 'svelte-preprocess-import-assets'
import { optimizeImports } from 'carbon-preprocess-svelte'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    svelte({
      preprocess: seqPreprocessor([sveltePreprocess(), optimizeImports(), importAssets()]),
    }),
  ],
})
