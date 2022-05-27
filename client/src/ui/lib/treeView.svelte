<script lang="ts">
	import type { RenderMap } from '../../gl/renderMap'
	import ContextMenu from './contextMenu.svelte'

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
	
	// ContextMenu
	let cm = { g: null, l: null }
	let cmX = 0
	let cmY = 0
	function showLayerOptions(g, l) {
		
	}

	function showCM(e, g, l = null) {
		cmX = e.clientX
		cmY = e.clientY
		cm = { g, l }
	}

	function hideCM() {
		cm = { g: null, l: null }
	}

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
					<span class="options"
							on:click={(e) => showCM(e, g)}></span>

					{#if cm.g === g && cm.l === null}
						<ContextMenu x={cmX} y={cmY} on:close={hideCM}>
							<label>Order <input type="number" min={0} max={rmap.groups.length} value={g}></label>
							<label>Pos X <input type="number" value={group.group.offX}></label>
							<label>Pos Y <input type="number" value={group.group.offY}></label>
							<label>Para X <input type="number" value={group.group.paraX}></label>
							<label>Para Y <input type="number" value={group.group.paraY}></label>
							<label>Name <input type="text" value={group.group.name}></label>
							<button>Add tile layer</button>
							<button>Delete group</button>
						</ContextMenu>
					{/if}

				</div>
		
				{#each group.layers as layer, l}
					<div class="layer" class:visible={layer.visible}>
						<label>
							<input name="layer" type="radio" bind:group={strSelected} value={toStr(g, l)} />
							{layer.layer.name || '<no name>'}
						</label>
						<span class="eye"
							on:click={() => layer.visible = !layer.visible}></span>
						<span class="options"
							on:click={(e) => showCM(e, g, l)}></span>

						{#if cm.g === g && cm.l === l}
							<ContextMenu x={cmX} y={cmY} on:close={hideCM}>
								<label>Group <input type="number" min={0} max={rmap.groups.length} value={g}></label>
								<label>Order <input type="number" min={0} max={group.layers.length} value={l}></label>
								<label>Name <input type="text" value={group.group.name}></label>
							</ContextMenu>
						{/if}

					</div>
				{/each}

			</div>
		{/each}

		<button>Add group</button>

	</div>
</nav>
