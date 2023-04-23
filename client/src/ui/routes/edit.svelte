<script lang="ts">
  import { server, serverConfig, rmap } from '../global'
  import { queryMap } from '../lib/util'
  import Dialog from '../lib/dialog.svelte'
  import Editor from '../lib/editor.svelte'
  import { RenderMap } from '../../gl/renderMap'

  export let mapName: string

  async function loadMap(name: string) {
    await $server.query('joinmap', { name })
    const map = await queryMap($serverConfig.httpUrl, name)
    return map
  }

  $: (async () => {
    const map = await loadMap(mapName)
    $rmap = new RenderMap(map)
  })()
</script>

<svelte:head>
  <title>{mapName} - DDNet Map Editor</title>
</svelte:head>

{#if $rmap === null}
  <Dialog>Loading "{mapName}"…</Dialog>
{:else}
  <Editor />
{/if}
