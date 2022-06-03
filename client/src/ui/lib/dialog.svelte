<script lang="ts">
	import { createEventDispatcher } from 'svelte'

	export let type: 'info' | 'warning' | 'error' | '' = ''
	export let closable = false
	export let message = ""

	const dispatch = createEventDispatcher()
	
	function onClose() {
		dispatch('close')
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
    <slot></slot>
  </div>
	
	{#if closable}
		<button on:click={onClose}>Close</button>
	{/if}

</div>