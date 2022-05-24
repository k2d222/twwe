<script lang="ts">
	import type { RenderMap } from '../../gl/renderMap'

	export let rmap: RenderMap
	export let visible = true
	export let selected: [number, number] = [-1, -1]

	let folded = new Array(rmap.groups.length).fill(false)

	function toStr(groupID: number, layerID: number) {
		return `${groupID},${layerID}`
	}

	function fromStr(str: string) {
		return str.split(',').map(x => parseInt(x)) as [number, number]
	}

	let strSelected = toStr(...selected)
	$: selected = fromStr(strSelected)
	
</script>

<nav class:hidden={!visible}>
	<div id="tree">

		{#each rmap.groups as group, g}
			<div class="group" class:visible={group.visible} class:folded={folded[g]}>
				<div class="title">
					<span class="fold"
						on:click={() => folded[g] = !folded[g]}></span>
					<b>#{g} {group.group.name}</b>
					<span class="eye"
						on:click={() => group.visible = !group.visible}></span>
					<span class="options"></span>
				</div>
		
				{#each group.layers as layer, l}
					<div class="layer" class:visible={layer.visible}>
						<label>
							<input name="layer" type="radio" bind:group={strSelected} value={toStr(g, l)} />
							{layer.layer.name || '<no name>'}
						</label>
						<span class="eye"
							on:click={() => layer.visible = !layer.visible}></span>
						<span class="options"></span>
					</div>
				{/each}

			</div>
		{/each}

		<button>Add group</button>

	</div>
</nav>
