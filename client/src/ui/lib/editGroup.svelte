
<script lang="ts">
  import type { EditGroup, DeleteGroup, ReorderGroup, CreateLayer } from '../../server/protocol'
  import type { RenderMap } from '../../gl/renderMap'
  import { SwitchLayer, TuneLayer, FrontLayer, SpeedupLayer, TeleLayer } from '../../twmap/tilesLayer'
  import { showInfo, showError, clearDialog } from '../lib/dialog'
  import { server } from '../global'
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher()
   
  export let rmap: RenderMap
  export let g: number

  $: rgroup = rmap.groups[g]
  $: group = rgroup.group

  function intVal(target: EventTarget) {
    return parseInt((target as HTMLInputElement).value)
  }

  function strVal(target: EventTarget) {
    return (target as HTMLInputElement).value
  }

  async function onEditGroup(change: EditGroup) {
    try {
      showInfo('Please wait…')
      await server.query('editgroup', change)
      rmap.editGroup(change)
      clearDialog()
      dispatch('change')
    } catch (e) {
      showError('Failed to edit group: ' + e)
    }
  }
  async function onReorderGroup(change: ReorderGroup) {
    try {
      showInfo('Please wait…')
      await server.query('reordergroup', change)
      rmap.reorderGroup(change)
      clearDialog()
      dispatch('change')
    } catch (e) {
      showError('Failed to reorder group: ' + e)
    }
  }
  async function onDeleteGroup(change: DeleteGroup) {
    try {
      showInfo('Please wait…')
      await server.query('deletegroup', change)
      rmap.deleteGroup(change)
      clearDialog()
      dispatch('change')
    } catch (e) {
      showError('Failed to delete group: ' + e)
    }
  }
  async function onCreateLayer(change: CreateLayer) {
    try {
      showInfo('Please wait…')
      await server.query('createlayer', change)
      rmap.createLayer(change)
      clearDialog()
      dispatch('change')
    } catch (e) {
      showError('Failed to create layer: ' + e)
    }
  }

</script>


<div class='edit-group'>  
  <span>Group #{g} {group.name}</span>
  <label>Order <input type="number" min={0} max={rmap.groups.length - 1} value={g}
    on:change={(e) => onReorderGroup({ group: g, newGroup: intVal(e.target) })}></label>
  <label>Pos X <input type="number" value={group.offX}
    on:change={(e) => onEditGroup({ group: g, offX: intVal(e.target) })}></label>
  <label>Pos Y <input type="number" value={group.offY}
    on:change={(e) => onEditGroup({ group: g, offY: intVal(e.target) })}></label>
  <label>Para X <input type="number" value={group.paraX}
    on:change={(e) => onEditGroup({ group: g, paraX: intVal(e.target) })}></label>
  <label>Para Y <input type="number" value={group.paraY}
    on:change={(e) => onEditGroup({ group: g, paraY: intVal(e.target) })}></label>
  {#if group !== rmap.physicsGroup.group}
    <label>Name <input type="text" value={group.name} maxlength={11}
      on:change={(e) => onEditGroup({ group: g, name: strVal(e.target) })}></label>
    <label>Use Clipping <input type="checkbox" checked={group.clipping}
      on:change={() => onEditGroup({ group: g, clipping: !group.clipping })}></label>
    <label>Clip X <input type="number" value={group.clipX} disabled={!group.clipping}
      on:change={(e) => onEditGroup({ group: g, clipX: intVal(e.target) })}></label>
    <label>Clip Y <input type="number" value={group.clipY} disabled={!group.clipping}
      on:change={(e) => onEditGroup({ group: g, clipY: intVal(e.target) })}></label>
    <label>Clip Width <input type="number" value={group.clipW} min={0} disabled={!group.clipping}
      on:change={(e) => onEditGroup({ group: g, clipW: intVal(e.target) })}></label>
    <label>Clip Height <input type="number" value={group.clipH} min={0} disabled={!group.clipping}
      on:change={(e) => onEditGroup({ group: g, clipH: intVal(e.target) })}></label>
  {/if}
  <button
    on:click={() => onCreateLayer({ kind: 'tiles', group: g, name: "" })}>
    Add tile layer
  </button>
  <button
    on:click={() => onCreateLayer({ kind: 'quads', group: g, name: "" })}>
    Add quad layer
  </button>
  {#if rgroup === rmap.physicsGroup}
    {#if !rmap.map.physicsLayer(SwitchLayer)}
      <button
        on:click={() => onCreateLayer({ kind: 'switch', group: g, name: "Switch" })}>
        Add switch layer
      </button>
    {/if}
    {#if !rmap.map.physicsLayer(FrontLayer)}
      <button
        on:click={() => onCreateLayer({ kind: 'front', group: g, name: "Front" })}>
        Add front layer
      </button>
    {/if}
    {#if !rmap.map.physicsLayer(TuneLayer)}
      <button
        on:click={() => onCreateLayer({ kind: 'tune', group: g, name: "Tune" })}>
        Add tune layer
      </button>
    {/if}
    {#if !rmap.map.physicsLayer(SpeedupLayer)}
      <button
        on:click={() => onCreateLayer({ kind: 'speedup', group: g, name: "Speedup" })}>
        Add speedup layer
      </button>
    {/if}
    {#if !rmap.map.physicsLayer(TeleLayer)}
      <button
        on:click={() => onCreateLayer({ kind: 'tele', group: g, name: "Tele" })}>
        Add tele layer
      </button>
    {/if}
  {/if}
  <button
    on:click={() => onDeleteGroup({ group: g })}>
    Delete group
  </button>
</div>
