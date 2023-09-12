<script lang="ts">
  import { server, serverConfig, rmap, map, automappers, view, View } from '../global'
  import { queryMap } from '../lib/util'
  import Dialog from '../lib/dialog.svelte'
  import Editor from '../lib/editor.svelte'
  import EditAutomapper from '../lib/editAutomapper.svelte'
  import Headerbar from '../lib/headerbar.svelte'
  import { setContext } from '../../gl/global'
  import { Renderer } from '../../gl/renderer'
  import { Viewport } from '../../gl/viewport'
  import { RenderMap } from '../../gl/renderMap'

  export let name: string

  const canvas = document.createElement('canvas')
  const viewport = new Viewport(canvas, canvas)
  const renderer = new Renderer(canvas)

  $: (async () => {
    await $server.query('joinmap', { name })
    const map_ = await queryMap($serverConfig.httpUrl, name)
    const am = await $server.query('listautomappers', null)
    $automappers = am.configs
    setContext({ renderer, viewport })
    $rmap = new RenderMap(map_)
    $map = map_
  })()

</script>

<svelte:head>
  <title>{name} - DDNet Map Editor</title>
</svelte:head>


<div id="edit">

  {#if $rmap === null}
    <Dialog>Loading "{name}"…</Dialog>
  {:else}

    <Headerbar />

    {#if $view === View.Automappers}
      <EditAutomapper />
    {:else if $view === View.Layers}
      <Editor />
    {/if}
  {/if}

</div>
