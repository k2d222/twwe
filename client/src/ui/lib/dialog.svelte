<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import Info from '../../../assets/color-info.svg?component'
  import Warning from '../../../assets/color-warning.svg?component'
  import Error from '../../../assets/color-error.svg?component'

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
      <Info />
    {:else if type === 'warning'}
      <Warning />
    {:else if type === 'error'}
      <Error />
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
