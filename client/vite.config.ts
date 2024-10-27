import { defineConfig } from 'vite'
import { imagetools } from 'vite-imagetools'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import sveltePreprocess from 'svelte-preprocess'
import seqPreprocessor from 'svelte-sequential-preprocessor'
import { importAssets } from 'svelte-preprocess-import-assets'
import { optimizeImports } from 'carbon-preprocess-svelte'
import svg from '@poppanator/sveltekit-svg'

// https://vitejs.dev/config/
export default defineConfig({
  css: {
    preprocessorOptions: {
      sass: {
        api: 'modern-compiler',
      },
      scss: {
        api: 'modern-compiler',
      },
    },
  },
  plugins: [
    imagetools(),
    svelte({
      preprocess: seqPreprocessor([sveltePreprocess(), optimizeImports(), importAssets()]),
    }),
    svg({
      svgoOptions: {
        plugins: [
          {
            name: 'preset-default',
            params: { overrides: { removeViewBox: false } },
          },
        ],
      },
    }),
  ],
})
