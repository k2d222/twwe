<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { EditGroup, DeleteGroup, ReorderGroup, EditLayer, CreateLayer, DeleteLayer, ReorderLayer } from '../../server/protocol'
  import type { RenderMap } from '../../gl/renderMap'
  import type { Color } from '../../twmap/types'
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

  function showCM(e: MouseEvent, g: number, l: number= null) {
    cmX = e.clientX
    cmY = e.clientY
    cm = { g, l }
  }

  function hideCM() {
    cm = { g: null, l: null }
  }

  function onEditGroup(change: EditGroup) {
    dispatch('editgroup', change)
  }

  function onEditLayer(change: EditLayer) {
    dispatch('editlayer', change)
  }
  
  function onReorderGroup(reorder: ReorderGroup) {
    dispatch('reordergroup', reorder)
    hideCM()
  }

  function onReorderLayer(reorder: ReorderLayer) {
    dispatch('reorderlayer', reorder)
    hideCM()
  }

  function onDeleteGroup(del: DeleteGroup) {
    dispatch('deletegroup', del)
    hideCM()
  }

  function onDeleteLayer(del: DeleteLayer) {
    dispatch('deletelayer', del)
    hideCM()
  }

  function onCreateGroup() {
    dispatch('creategroup', { name: "" })
  }

  function onCreateLayer(create: CreateLayer) {
    dispatch('createlayer', create)
  }

  function colorToStr(c: Color) {
    let hex = (i: number) => ('0' + i.toString(16)).slice(-2)
    return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`
  }

  function strToColor(rgb: string, a: number) {
    return {
      r: parseInt(rgb.slice(1, 3), 16),
      g: parseInt(rgb.slice(3, 5), 16),
      b: parseInt(rgb.slice(5, 7), 16),
      a,
    }
  }
  
  function intVal(target: EventTarget) {
    return parseInt((target as HTMLInputElement).value)
  }

  function strVal(target: EventTarget) {
    return (target as HTMLInputElement).value
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
                on:change={(e) => onReorderGroup({ group: g, newGroup: intVal(e.target) })}></label>
              <label>Pos X <input type="number" value={group.group.offX}
                on:change={(e) => onEditGroup({ group: g, offX: intVal(e.target) })}></label>
              <label>Pos Y <input type="number" value={group.group.offY}
                on:change={(e) => onEditGroup({ group: g, offY: intVal(e.target) })}></label>
              <label>Para X <input type="number" value={group.group.paraX}
                on:change={(e) => onEditGroup({ group: g, paraX: intVal(e.target) })}></label>
              <label>Para Y <input type="number" value={group.group.paraY}
                on:change={(e) => onEditGroup({ group: g, paraY: intVal(e.target) })}></label>
              <label>Name <input type="text" value={group.group.name}
                on:change={(e) => onEditGroup({ group: g, name: strVal(e.target) })}></label>
              <button
                on:click={() => onCreateLayer({ kind: 'tiles', group: g, name: "" })}>
                Add tile layer
              </button>
              <button
                on:click={() => onCreateLayer({ kind: 'quads', group: g, name: "" })}>
                Add quad layer
              </button>
              <button
                on:click={() => onDeleteGroup({ group: g })}>
                Delete group
              </button>
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
                  on:change={(e) => onReorderLayer({ group: g, layer: l, newGroup: intVal(e.target), newLayer: 0 })}></label>
                <label>Order <input type="number" min={0} max={group.layers.length - 1} value={l}
                  on:change={(e) => onReorderLayer({ group: g, layer: l, newGroup: g, newLayer: intVal(e.target) })}></label>
                {#if layer.layer instanceof TileLayer}
                  <label>Width <input type="number" min={1} max={10000} value={layer.layer.width}
                    on:change={(e) => onEditLayer({ group: g, layer: l, width: intVal(e.target) })}></label>
                  <label>Height <input type="number" min={1} max={10000} value={layer.layer.height}
                    on:change={(e) => onEditLayer({ group: g, layer: l, height: intVal(e.target) })}></label>
                  {@const col = layer.layer.color}
                  <label>Color <input type="color" value={colorToStr(layer.layer.color)}
                    on:change={(e) => onEditLayer({ group: g, layer: l, color: strToColor(strVal(e.target), col.a) })}></label>
                  <label>Opacity <input type="range" min={0} max={255} value={col.a}
                    on:change={(e) => onEditLayer({ group: g, layer: l, color: { ...col, a: intVal(e.target) } })}></label>
                {/if}
                <label>Name <input type="text" value={layer.layer.name}
                  on:change={(e) => onEditLayer({ group: g, layer: l, name: strVal(e.target) })}></label>
                <button
                  on:click={() => onDeleteLayer({ group: g, layer: l })}>
                  Delete layer
                </button>
              </ContextMenu>
            {/if}

          </div>
        {/each}

      </div>
    {/each}

    <button on:click={onCreateGroup}>Add group</button>

  </div>
</nav>
