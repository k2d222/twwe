<script lang="ts">
  import type { AutomapperConfig } from '../../twmap/mapdir'
  import { lint as lintAutomapper, LintLevel } from '../../twmap/automap'
  import { showError, showInfo, showWarning } from './dialog'
  import { createEventDispatcher } from 'svelte'
  import { server } from '../global'

  export let automapper: AutomapperConfig | null
  export let configs: string[]

  let dispatch = createEventDispatcher<{ change: AutomapperConfig }>()

  async function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files === null || input.files.length === 0) return
    const file = input.files[0]
    const str = await file.text()

    // const newRules = parseAutomapper(str) ?? []
    const lints = lintAutomapper(str)
    const errs = lints.filter(l => l.level === LintLevel.Error)

    if (errs.length > 0) {
      const resp = await showWarning(
        `The automapper contains ${errs.length} error(s). Proceed?`,
        'yesno'
      )
      if (!resp) return
    }

    try {
      const res = await $server.query('create/automapper', [file.name, str])
      if (res.length !== 0) {
        showWarning(
          `Automapper has ${res.length} issues(s). Check the autommapper tab for more details.`
        )
      }
    } catch (e) {
      showError('Saving failed: ' + e)
      return
    }

    showInfo(`Uploaded '${file.name}'.`)
  }

  async function onConfig() {
    dispatch('change', automapper)
  }
</script>

<div class="edit-automapper">
  <label>
    Upload rules
    <input type="file" placeholder="upload rules…" accept=".rules,.rpp" on:change={onFileChange} />
  </label>

  <label>
    Config
    <select bind:value={automapper.config} on:change={onConfig}>
      <option value={-1} selected={automapper.config === -1 || automapper.config === null}>
        None
      </option>
      {#each configs as conf, i}
        <option value={i} selected={automapper.config === i}>#{i} {conf}</option>
      {/each}
      {#if automapper.config >= configs.length}
        <option value={automapper.config} selected>
          #{automapper.config} (missing)
        </option>
      {/if}
    </select>
  </label>

  <label>
    Seed
    <input type="number" bind:value={automapper.seed} on:change={onConfig} />
  </label>
  <label>
    Automatic
    <input type="checkbox" bind:checked={automapper.automatic} on:change={onConfig} />
  </label>
</div>
