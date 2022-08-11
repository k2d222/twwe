<script lang="ts">
  import type { Info } from '../../twmap/map'
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher()

  export let info: Info
  
  function onChange() {
    dispatch('change')
  }

  function onClose() {
    dispatch('close')
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape')
      onClose()
  }

</script>

<svelte:window on:keydown={onKeyDown} />

<div id="info-editor">
  <div class="content">
    <div class="edit-info">
      <h3>Edit map info</h3>
      <label>Author(s)
        <input type="text" bind:value={info.author} maxlength="31" on:change={onChange} />
      </label>
      <label>Version
        <input type="text" bind:value={info.version} maxlength="15" on:change={onChange} />
      </label>
      <label>Credits
        <input type="text" bind:value={info.credits} maxlength="127" on:change={onChange} />
      </label>
      <label>License
        <input type="text" bind:value={info.license} maxlength="31" on:change={onChange} />
      </label>
      <label>Server Settings
        <textarea bind:value={info.settings} on:change={onChange} title="Server settings allow running commands on the server when the map is loaded."></textarea>
      </label>
      <button on:click={onClose}>Close</button>
    </div>
  </div>
</div>