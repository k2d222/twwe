<script lang="ts">
  import type { TilesLayer } from '../../twmap/tilesLayer'
  import {
    Automapper,
    parse as parseAutomapper,
    lint as lintAutomapper,
    LintLevel,
  } from '../../twmap/automap'
  import { showInfo } from './dialog'
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher()

  export let layer: TilesLayer
  let configs: { [name: string]: Automapper } = {}
  let selectedIndex: number = -1

  $: layer.automapper.config = selectedIndex

  async function onFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files[0]
    const str = await file.text()
    const newRules = parseAutomapper(str)
    const lints = lintAutomapper(str)

    const errs = lints.filter(l => l.level === LintLevel.Error)
    const warns = lints.filter(l => l.level === LintLevel.Warning)

    if (newRules)
      for (const rule of newRules) {
        configs[rule.name] = rule
      }

    showInfo(
      `Uploaded ${newRules.length} rules with ${errs.length} errors and ${warns.length} warnings.`,
      'closable'
    )
  }

  function onClose() {
    layer = layer
    dispatch('close')
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }
</script>

<svelte:window on:keydown={onKeyDown} />

<div id="automapper">
  <div class="content">
    <div class="edit-automapper">
      <h3>Automapper configuration</h3>

      <label>
        Upload rules
        <input type="file" placeholder="upload rules…" accept=".rules" on:change={onFileChange} />
      </label>

      <label>
        Active rule
        <select bind:value={selectedIndex}>
          <option value={-1}>None</option>
          {#each Object.keys(configs) as conf, i}
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

      <button on:click={onClose}>Close</button>
    </div>
  </div>
</div>
