<script lang="ts">
  import { server } from '../global'
  import { queryMap } from '../lib/util'
  import Dialog from '../lib/dialog.svelte'
  import Editor from '../lib/editor.svelte'

  export let mapName: string

  async function loadMap(name: string) {
    await server.query('joinmap', { name })
    const map = await queryMap(server, { name })
    return map
  }

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
