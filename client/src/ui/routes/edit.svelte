<script lang="ts">
  import { server, serverConfig, map, automappers, view, View } from '../global'
  import { queryMap } from '../lib/util'
  import Editor from '../lib/editor.svelte'
  import EditAutomapper from '../lib/editAutomapper.svelte'
  import Headerbar from '../lib/headerbar.svelte'
  import Fence from '../lib/fence.svelte'
  import { onDestroy } from 'svelte'
  import type { AutomapperKind } from '../../server/protocol'

  export let name: string

  let loadingSignal = (async () => {
    await $server.query('join', name)
    const map_ = await queryMap($serverConfig.httpUrl, name)
    const ams = await $server.query('map/get/automappers', undefined)
    $automappers = Object.fromEntries(ams.map(name => [name, {
      name,
      kind: name.slice(name.lastIndexOf('.') + 1) as AutomapperKind,
      image: name.slice(0, name.lastIndexOf('.')),
      file: null,
    }]))
    $map = map_
  })()

  onDestroy(() => {
    $server.query('leave', name)
  })

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
