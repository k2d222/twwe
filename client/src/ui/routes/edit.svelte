<script lang="ts">
  import { server, serverConfig, rmap, map, automappers, view, View } from '../global'
  import { queryMap } from '../lib/util'
  import Dialog from '../lib/dialog.svelte'
  import Editor from '../lib/editor.svelte'
  import EditAutomapper from '../lib/editAutomapper.svelte'
  import Headerbar from '../lib/headerbar.svelte'
  import Fence from '../lib/fence.svelte'

  export let name: string

  let loadingSignal = (async () => {
    await $server.query('joinmap', { name })
    const map_ = await queryMap($serverConfig.httpUrl, name)
    $automappers = await $server.query('listautomappers', null)
    $map = map_
  })()

</script>

<svelte:head>
  <title>{name} - DDNet Map Editor</title>
</svelte:head>


<div id="edit">

  <Fence fullscreen signal={loadingSignal} loadText="Downloading map…">
    <Headerbar />

    {#if $view === View.Automappers}
      <EditAutomapper />
    {:else if $view === View.Layers}
      <Editor />
    {/if}
  </Fence>

</div>
