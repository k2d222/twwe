<script lang="ts">
  import { server, serverCfg, map, automappers, view, View, reset } from '../global'
  import { queryMap } from '../lib/util'
  import Editor from '../lib/editor.svelte'
  import EditAutomapper from '../lib/editAutomapper.svelte'
  import Headerbar from '../lib/headerbar.svelte'
  import Fence from '../lib/fence.svelte'
  import { onDestroy, onMount } from 'svelte'
  import { showError } from '../lib/dialog'
  import { serverHttpUrl } from '../../server/util'

  export let name: string

  let loadingSignal = (async () => {
    reset()

    await $server.query('join', name)
    const httpUrl = serverHttpUrl($serverCfg)
    const map_ = await queryMap(httpUrl, name)
    const ams = await $server.query('get/automappers', undefined)
    $automappers = Object.fromEntries(ams.map(am => [am.name, am]))
    $map = map_
  })()

  function serverOnError(e: string) {
    showError(e[0].toUpperCase() + e.slice(1))
  }

  onMount(() => {
    $server.onError(serverOnError)
  })

  onDestroy(() => {
    $server.onError(() => {})
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
