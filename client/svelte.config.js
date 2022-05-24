import sveltePreprocess from 'svelte-preprocess'
import importAssets from 'svelte-preprocess-import-assets'
import seqPreprocessor from 'svelte-sequential-preprocessor'

export default {
  // Consult https://github.com/sveltejs/svelte-preprocess
  // for more information about preprocessors
  preprocess: seqPreprocessor([ sveltePreprocess(), importAssets() ])
}
