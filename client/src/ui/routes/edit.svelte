<script lang="ts">
  import { server, serverConfig, map, automappers, view, View } from '../global'
  import { queryMap } from '../lib/util'
  import Editor from '../lib/editor.svelte'
  import EditAutomapper from '../lib/editAutomapper.svelte'
  import Headerbar from '../lib/headerbar.svelte'
  import Fence from '../lib/fence.svelte'
  import { onDestroy, onMount } from 'svelte'
  import { showError } from '../lib/dialog'

  export let name: string

  let loadingSignal = (async () => {
    await $server.query('join', name)
    const httpUrl = `http${$serverConfig.encrypted ? 's' : ''}://${$serverConfig.host}:${$serverConfig.port}`
    const map_ = await queryMap(httpUrl, name)
    const ams = await $server.query('get/automappers', undefined)
    $automappers = Object.fromEntries(ams.map(am => [am.name, am]))
    $map = map_
  })()

  function serverOnError(e: string) {
    showError('Server Error: ' + e)
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
