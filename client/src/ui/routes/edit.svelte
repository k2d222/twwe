<script lang="ts">
  import { server, serverConfig, rmap, automappers } from '../global'
  import { queryMap } from '../lib/util'
  import Dialog from '../lib/dialog.svelte'
  import Editor from '../lib/editor.svelte'
  import { RenderMap } from '../../gl/renderMap'

  export let name: string

  $: (async () => {
    await $server.query('joinmap', { name })
    const map = await queryMap($serverConfig.httpUrl, name)
    const am = await $server.query('listautomappers', null)
    $automappers = am.configs
    $rmap = new RenderMap(map)
  })()
</script>

<svelte:head>
  <title>{name} - DDNet Map Editor</title>
</svelte:head>

{#if $rmap === null}
  <Dialog>Loading "{name}"…</Dialog>
{:else}
  <Editor />
{/if}
