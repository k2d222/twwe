<script lang="ts">
  import { createEventDispatcher } from 'svelte'

  export let type: 'info' | 'warning' | 'error' | '' = ''
  export let controls: 'closable' | 'yesno' | 'none' = 'none'
  export let message = ''

  const dispatch = createEventDispatcher()

  function onClose() {
    dispatch('close')
  }
  function onYes() {
    dispatch('close', true)
  }
  function onNo() {
    dispatch('close', false)
  }
</script>

<div id="dialog" class={type}>
  <div class="content">
    {#if type === 'info'}
      <img src="/assets/color-info.svg" alt="info" />
    {:else if type === 'warning'}
      <img src="/assets/color-warning.svg" alt="warning" />
    {:else if type === 'error'}
      <img src="/assets/color-error.svg" alt="error" />
    {/if}
    {message}
    <slot />
  </div>

  {#if controls === 'closable'}
    <button class="default" on:click={onClose}>Close</button>
  {:else if controls === 'yesno'}
    <div class="buttons">
      <button class="default" on:click={onNo}>No</button>
      <button class="default" on:click={onYes}>Yes</button>
    </div>
  {/if}
</div>
