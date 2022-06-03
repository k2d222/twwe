<script lang="ts">
  import { loadMap } from '../lib/editor'
  import Dialog from '../lib/dialog.svelte'
  import Editor from '../lib/editor.svelte'

  export let mapName: string
  
  const pLoadMap = loadMap(mapName)
</script>

{#await pLoadMap}
  <Dialog>Loading "{mapName}"…</Dialog>
{:then map}
  <Editor {map} />
{:catch e}
  {console.error(e)}
  <Dialog type="error">Failed to join the map "{mapName}".</Dialog>
{/await}

