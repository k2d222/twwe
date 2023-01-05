<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte'
  export let x = 0
  export let y = 0

  const dispatch = createEventDispatcher()

  function onClose() {
    dispatch('close')
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }

  let self: HTMLElement

  function getStyle(x: number, y: number) {
    let top = Math.min(y, window.innerHeight - self.offsetHeight)
    let left = Math.min(x, window.innerWidth - self.offsetWidth)
    return `top: ${top}px; left: ${left}px`
  }

  let style: string

  onMount(() => {
    style = getStyle(x, y)
  })
</script>

<svelte:window on:keydown={onKeyDown} />

<div class="context" role="presentation" on:click|self={onClose}>
  <div class="content" role="menu" bind:this={self} {style}>
    <slot />
  </div>
</div>
