<script lang="ts">
  import type { TilesLayer } from '../../twmap/tilesLayer'
  import {
    Automapper,
    parse as parseAutomapper,
    lint as lintAutomapper,
    LintLevel,
  } from '../../twmap/automap'
  import { showInfo } from './dialog'

  export let layer: TilesLayer
  let configs: Automapper[] = []
  $: config = layer.automapper.config

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
</script>

<div class="edit-automapper">
  <label>
    Upload rules
    <input type="file" placeholder="upload rules…" accept=".rules" on:change={onFileChange} />
  </label>

  <label>
    Active rule
    <select bind:value={config}>
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
</div>
