<script lang="ts">
  import type { TilesLayer } from '../../twmap/tilesLayer'
  import {
    lint as lintAutomapper,
    LintLevel,
    lintToString,
  } from '../../twmap/automap'
  import { showError, showInfo, showWarning } from './dialog'
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'
  import { server, automappers } from '../global'
  import type { Recv } from 'src/server/protocol'

  export let layer: TilesLayer

  let dispatch = createEventDispatcher<{change: number}>()

  $: configs = $automappers[layer.image?.name + '.rules']?.configs ?? []

  async function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files === null || input.files.length === 0)
      return
    const file = input.files[0]
    const name = file.name.replace(/.rules$/, '')
    const str = await file.text()

    // const newRules = parseAutomapper(str) ?? []
    const lints = lintAutomapper(str)
    const errs = lints.filter(l => l.level === LintLevel.Error)

    for (const lint of lints) {
      await showError(lintToString(lint))
    }

    if (errs.length > 0) {
      const resp = await showWarning(`The automapper contains ${errs.length} error(s). Proceed?`, 'yesno')
      if (!resp) return
    }

    try {
      await $server.query('map/put/automapper', [file.name, str])
    }
    catch (e) {
      showError("Saving failed: " + e)
      return
    }

    showInfo(`Uploaded '${name}'.`, 'closable')
  }

  async function onConfig() {
    dispatch('change', layer.automapper.config)
  }

  function onSync([_g, _l, e]: Recv['map/post/layer']) {
    if ('automapper_config' in e || 'image' in e)
      layer = layer
  }

  onMount(() => {
    $server.on('map/post/layer', onSync)
  })

  onDestroy(() => {
    $server.off('map/post/layer', onSync)
  })
</script>

<div class="edit-automapper">
  <label>
    Upload rules
    <input type="file" placeholder="upload rules…" accept=".rules" on:change={onFileChange} />
  </label>

  <label>
    Config
    <select bind:value={layer.automapper.config} on:change={onConfig}>
      <option value={-1}>None</option>
      {#each configs as conf, i}
        <option value={i}>#{i} {conf}</option>
      {/each}
      {#if layer.automapper.config >= configs.length}
        <option value={layer.automapper.config}>#{layer.automapper.config} (missing)</option>
      {/if}
    </select>
  </label>

  <label>
    Seed
    <input type="number" bind:value={layer.automapper.seed} on:change={onConfig} />
  </label>
  <label>
    Automatic
    <input type="checkbox" bind:checked={layer.automapper.automatic} on:change={onConfig} />
  </label>
</div>
