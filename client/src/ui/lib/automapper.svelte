<script lang="ts">
  import type { TilesLayer } from '../../twmap/tilesLayer'
  import {
    parse as parseAutomapper,
    lint as lintAutomapper,
    LintLevel,
  } from '../../twmap/automap'
  import { showInfo } from './dialog'
  import { createEventDispatcher } from 'svelte'
  import { rmap, server, automappers } from '../global'

  export let layer: TilesLayer

  let dispatch = createEventDispatcher<{change: number}>()

  $: configs = $automappers[layer.image?.name] ?? []

  async function onFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files[0]
    const name = file.name.replace(/.rules$/, '')
    const str = await file.text()

    // const newRules = parseAutomapper(str) ?? []
    const lints = lintAutomapper(str)
    const errs = lints.filter(l => l.level === LintLevel.Error)
    const warns = lints.filter(l => l.level === LintLevel.Warning)

    await $server.query('uploadautomapper', {
      image: name,
      content: str,
    })

    const am = await $server.query("listautomappers", null)
    $automappers = am.configs

    showInfo(
      `Uploaded ${am.configs[name].length} rules for '${name}' with ${errs.length} errors and ${warns.length} warnings.`,
      'closable'
    )
  }

  async function onConfig() {
    dispatch('change', layer.automapper.config)
  }
</script>

<div class="edit-automapper">
  <label>
    Upload rules
    <input type="file" placeholder="upload rules…" accept=".rules" on:change={onFileChange} />
  </label>

  <label>
    Active rule
    <select bind:value={layer.automapper.config} on:change={onConfig}>
      <option value={-1}>None</option>
      {#each configs as conf, i}
        <option value={i}>{conf}</option>
      {/each}
    </select>
  </label>

  <label>
    Seed
    <input type="number" bind:value={layer.automapper.seed} />
  </label>
  <label>
    Automatic
    <input type="checkbox" bind:checked={layer.automapper.automatic} />
  </label>
</div>
