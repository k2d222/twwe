<script lang="ts">
  import { createEventDispatcher } from 'svelte'
	import type { RenderMap } from '../../gl/renderMap'
	import type { Layer } from '../../twmap/layer'
	import { TileLayer } from '../../twmap/tileLayer'
	import ContextMenu from './contextMenu.svelte'

  const dispatch = createEventDispatcher()

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

	function onGroupChange(change: GroupChange) {
		dispatch('groupchange', change)
		rmap = rmap // this is a hack to recompute everything
		if(change.order) {
			hideCM()
		}
	}

	function onLayerChange(change: LayerChange) {
		dispatch('layerchange', change)
		rmap = rmap // this is a hack to recompute everything
		if(change.order) {
			hideCM()
		}
	}

	function colorToStr(c: Color) {
		let hex = (i: number) => ('0' + i.toString(16)).slice(-2)
		console.log(`#${hex(c.r)}${hex(c.g)}${hex(c.b)}`)
		return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`
	}

	function strToColor(rgb: string, a: number) {
		return {
      r: parseInt(rgb.substr(1, 2), 16),
      g: parseInt(rgb.substr(3, 2), 16),
      b: parseInt(rgb.substr(5, 2), 16),
			a,
    }
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
							<label>Order <input type="number" min={0} max={rmap.groups.length - 1} value={g}
								on:change={(e) => onGroupChange({ group: g, order: parseInt(e.target.value) })}></label>
							<label>Pos X <input type="number" value={group.group.offX}
								on:change={(e) => onGroupChange({ group: g, offX: parseInt(e.target.value) })}></label>
							<label>Pos Y <input type="number" value={group.group.offY}
								on:change={(e) => onGroupChange({ group: g, offY: parseInt(e.target.value) })}></label>
							<label>Para X <input type="number" value={group.group.paraX}
								on:change={(e) => onGroupChange({ group: g, paraX: parseInt(e.target.value) })}></label>
							<label>Para Y <input type="number" value={group.group.paraY}
								on:change={(e) => onGroupChange({ group: g, paraY: parseInt(e.target.value) })}></label>
							<label>Name <input type="text" value={group.group.name}
								on:change={(e) => onGroupChange({ group: g, name: e.target.value })}></label>
							<button>Add tile layer</button>
							<button>Delete group</button>
						</ContextMenu>
					{/if}

				</div>
		
				{#each group.layers as layer, l}
					<div class="layer" class:visible={layer.visible}>
						<label>
							<input name="layer" type="radio" bind:group={strSelected} value={toStr(g, l)} disabled={!(layer.layer instanceof TileLayer)} />
							{layer.layer.name || '<no name>'}
						</label>
						<span class="eye"
							on:click={() => layer.visible = !layer.visible}></span>
						<span class="options"
							on:click={(e) => showCM(e, g, l)}></span>

						{#if cm.g === g && cm.l === l}
							<ContextMenu x={cmX} y={cmY} on:close={hideCM}>
								<label>Group <input type="number" min={0} max={rmap.groups.length - 1} value={g}
									on:change={(e) => onLayerChange({ group: g, layer: l, order: { group: parseInt(e.target.value) } })}></label>
								<label>Order <input type="number" min={0} max={group.layers.length - 1} value={l}
									on:change={(e) => onLayerChange({ group: g, layer: l, order: { layer: parseInt(e.target.value) } })}></label>
								{#if layer.layer instanceof TileLayer}
									<label>Color <input type="color" value={colorToStr(layer.layer.color)}
										on:change={(e) => onLayerChange({ group: g, layer: l, color: strToColor(e.target.value, layer.layer.color.a) })}></label>
									<label>Opacity <input type="range" min={0} max={255} value={layer.layer.color.a}
										on:change={(e) => onLayerChange({ group: g, layer: l, color: { ...layer.layer.color, a: parseInt(e.target.value) } })}></label>
								{/if}
								<label>Name <input type="text" value={layer.layer.name}
									on:change={(e) => onLayerChange({ group: g, layer: l, name: e.target.value })}></label>
								<button>Delete layer</button>
							</ContextMenu>
						{/if}

					</div>
				{/each}

			</div>
		{/each}

		<button>Add group</button>

	</div>
</nav>
