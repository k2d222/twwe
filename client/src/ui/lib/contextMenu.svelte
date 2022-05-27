<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  export let visible=false
  export let x = 0
  export let y = 0

  const dispatch = createEventDispatcher()
  
  function onClose() {
    dispatch('close')
  }


  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape')
      onClose()
  }

</script>

<svelte:window on:keydown={onKeyDown} />

<div class="context" on:click|self={onClose}>
  <div class="content" style="top: {y}px; left: {x}px">    
    <slot></slot>
  </div>
</div>

