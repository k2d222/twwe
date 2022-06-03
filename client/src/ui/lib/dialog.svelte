<script lang="ts">
	export let type: 'info' | 'warning' | 'error' | '' = ''
</script>

<div id="dialog" class={type}>

	{#if type === 'info'}
		<img src="/assets/color-info.svg" alt="info" />
	{:else if type === 'warning'}
		<img src="/assets/color-warning.svg" alt="warning" />
	{:else if type === 'error'}
		<img src="/assets/color-error.svg" alt="error" />
	{/if}

	<div class="content">
    <slot></slot>
  </div>

</div>