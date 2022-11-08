
<script lang="ts">
  import type { FormInputEvent } from './util'
  import type { EditGroup, DeleteGroup, ReorderGroup, CreateLayer, RequestContent } from '../../server/protocol'
  import type { RenderMap } from '../../gl/renderMap'
  import { SwitchLayer, TuneLayer, FrontLayer, SpeedupLayer, TeleLayer } from '../../twmap/tilesLayer'
  import { createEventDispatcher } from 'svelte'

  type Events = 'createlayer' | 'editgroup' | 'reordergroup' | 'deletegroup'
  type EventMap = { [K in Events]: RequestContent[K] }

  const dispatch = createEventDispatcher<EventMap>()
   
  export let rmap: RenderMap
  export let g: number

  $: rgroup = rmap.groups[g]
  $: group = rgroup.group

  function parseI32(str: string) {
    return clamp(parseInt(str), -2_147_483_648, 2_147_483_647)
  }

  function clamp(cur: number, min: number, max: number) {
    return Math.min(Math.max(min, cur), max)
  }

  function onEditGroup(change: EditGroup) {
    dispatch('editgroup', change)
  }
  function onReorderGroup(change: ReorderGroup) {
    dispatch('reordergroup', change)
  }
  function onDeleteGroup(change: DeleteGroup) {
    dispatch('deletegroup', change)
  }
  function onCreateLayer(change: CreateLayer) {
    dispatch('createlayer', change)
  }
  
  function onEditOrder(e: FormInputEvent) {
    const newGroup = clamp(parseInt(e.currentTarget.value), 0, rmap.groups.length - 1)
    if (!isNaN(newGroup))
      onReorderGroup({ group: g, newGroup })
  }
  function onEditPosX(e: FormInputEvent) {
    const offX = parseI32(e.currentTarget.value)
    if (!isNaN(offX))
      onEditGroup({ group: g, offX })
  }
  function onEditPosY(e: FormInputEvent) {
    const offY = parseI32(e.currentTarget.value)
    if (!isNaN(offY))
      onEditGroup({ group: g, offY })
  }
  function onEditParaX(e: FormInputEvent) {
    const paraX = parseI32(e.currentTarget.value)
    if (!isNaN(paraX))
      onEditGroup({ group: g, paraX })
  }
  function onEditParaY(e: FormInputEvent) {
    const paraY = parseI32(e.currentTarget.value)
    if (!isNaN(paraY))
      onEditGroup({ group: g, paraY })
  }
  function onEditName(e: FormInputEvent) {
    const name = e.currentTarget.value.substring(0, 11)
    onEditGroup({ group: g, name })
  }
  function onEditUseClipping(_: FormInputEvent) {
    const clipping = !group.clipping
    onEditGroup({ group: g, clipping })
  }
  function onEditClipX(e: FormInputEvent) {
    const clipX = parseI32(e.currentTarget.value)
    if (!isNaN(clipX))
      onEditGroup({ group: g, clipX })
  }
  function onEditClipY(e: FormInputEvent) {
    const clipY = parseI32(e.currentTarget.value)
    if (!isNaN(clipY))
      onEditGroup({ group: g, clipY })
  }
  function onEditClipW(e: FormInputEvent) {
    const clipW = Math.max(parseI32(e.currentTarget.value), 0)
    if (!isNaN(clipW))
      onEditGroup({ group: g, clipW })
  }
  function onEditClipH(e: FormInputEvent) {
    const clipH = Math.max(parseI32(e.currentTarget.value), 0)
    if (!isNaN(clipH))
      onEditGroup({ group: g, clipH })
  }
 
</script>


<div class='edit-group'>  
  <h3 class="bx--modal-header__heading">Group #{g} {group.name}</h3>
  <label>Order <input type="number" min={0} max={rmap.groups.length - 1} value={g} on:change={onEditOrder}></label>
  {#if group !== rmap.physicsGroup.group}
    <label>Pos X <input type="number" value={group.offX} on:change={onEditPosX}></label>
    <label>Pos Y <input type="number" value={group.offY} on:change={onEditPosY}></label>
    <label>Para X <input type="number" value={group.paraX} on:change={onEditParaX}></label>
    <label>Para Y <input type="number" value={group.paraY} on:change={onEditParaY}></label>
    <label>Use Clipping <input type="checkbox" checked={group.clipping} on:change={onEditUseClipping}></label>
    <label>Clip X <input type="number" value={group.clipX} disabled={!group.clipping} on:change={onEditClipX}></label>
    <label>Clip Y <input type="number" value={group.clipY} disabled={!group.clipping} on:change={onEditClipY}></label>
    <label>Clip Width <input type="number" value={group.clipW} min={0} disabled={!group.clipping} on:change={onEditClipW}></label>
    <label>Clip Height <input type="number" value={group.clipH} min={0} disabled={!group.clipping} on:change={onEditClipH}></label>
    <label>Name <input type="text" value={group.name} maxlength={11} on:change={onEditName}></label>
  {/if}
  <button class="default" on:click={() => onCreateLayer({ kind: 'tiles', group: g, name: "" })}>
    Add tile layer
  </button>
  <button class="default" on:click={() => onCreateLayer({ kind: 'quads', group: g, name: "" })}>
    Add quad layer
  </button>
  {#if rgroup === rmap.physicsGroup}
    {#if !rmap.map.physicsLayer(SwitchLayer)}
      <button class="default" on:click={() => onCreateLayer({ kind: 'switch', group: g, name: "Switch" })}>
        Add switch layer
      </button>
    {/if}
    {#if !rmap.map.physicsLayer(FrontLayer)}
      <button class="default" on:click={() => onCreateLayer({ kind: 'front', group: g, name: "Front" })}>
        Add front layer
      </button>
    {/if}
    {#if !rmap.map.physicsLayer(TuneLayer)}
      <button class="default" on:click={() => onCreateLayer({ kind: 'tune', group: g, name: "Tune" })}>
        Add tune layer
      </button>
    {/if}
    {#if !rmap.map.physicsLayer(SpeedupLayer)}
      <button class="default" on:click={() => onCreateLayer({ kind: 'speedup', group: g, name: "Speedup" })}>
        Add speedup layer
      </button>
    {/if}
    {#if !rmap.map.physicsLayer(TeleLayer)}
      <button class="default" on:click={() => onCreateLayer({ kind: 'tele', group: g, name: "Tele" })}>
        Add tele layer
      </button>
    {/if}
  {/if}
  {#if rmap.groups[g] !== rmap.physicsGroup}
    <button class="danger large" on:click={() => onDeleteGroup({ group: g })}>
      Delete group
    </button>
  {/if}
</div>
