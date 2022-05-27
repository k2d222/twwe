<script>
  import { createEventDispatcher } from 'svelte'
  export let visible=false
  export let x = 0
  export let y = 0

  const dispatch = createEventDispatcher()
  
  function onClose() {
    dispatch('close')
  }
</script>

<div class="context" on:click|self={onClose}>
  <div class="content" style="top: {y}px; left: {x}px">    
    <slot></slot>
  </div>
</div>

