<script lang="ts">
  import { server, map, automappers, view, View, reset } from '../global'
  import { queryMap } from '../lib/util'
  import Editor from '../lib/editor.svelte'
  import EditAutomapper from '../lib/editAutomapper.svelte'
  import Headerbar from '../lib/headerbar.svelte'
  import Fence from '../lib/fence.svelte'
  import { onDestroy, onMount } from 'svelte'
  import { showError } from '../lib/dialog'
  import { navigate } from 'svelte-routing'
  import type { Recv } from '../../server/protocol'

  export let name: string
  export let password: string

  let loadingSignal = (async () => {
    reset()

    await $server.query('join', { name, password })
    const map_ = await queryMap($server, name)
    const ams = await $server.query('get/automappers', undefined)
    $automappers = Object.fromEntries(ams.map(am => [am.name, am]))
    $map = map_
  })()

  function serverOnError(e: string) {
    showError(e[0].toUpperCase() + e.slice(1))
  }
  async function serverOnDeleteAutomapper(_e: Recv['delete/automapper'], prom: Promise<void>) {
    await prom
    const ams = await $server.query('get/automappers', undefined)
    $automappers = Object.fromEntries(ams.map(am => [am.name, am]))
  }
  async function serverOnCreateAutomapper(_e: Recv['create/automapper'], prom: Promise<void>) {
    await prom
    const ams = await $server.query('get/automappers', undefined)
    $automappers = Object.fromEntries(ams.map(am => [am.name, am]))
  }
  async function onServerClosed() {
    await showError('You have been disconnected from the server.')
    navigate('/')
  }

  onMount(() => {
    $server.socket.addEventListener('close', onServerClosed, { once: true })
    $server.on('delete/automapper', serverOnDeleteAutomapper)
    $server.on('create/automapper', serverOnCreateAutomapper)

    $server.onError(serverOnError)
  })

  onDestroy(() => {
    $server.socket.removeEventListener('error', onServerClosed)
    $server.off('delete/automapper', serverOnDeleteAutomapper)
    $server.off('create/automapper', serverOnCreateAutomapper)

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
