<script lang="ts">
  import {
    SwitchLayer,
    TuneLayer,
    FrontLayer,
    SpeedupLayer,
    TeleLayer,
  } from '../../twmap/tilesLayer'
  import { fromFixedNum, toFixedNum } from '../../server/convert'
  import { map, server } from '../global'
  import { pick, sync } from '../../server/util'
  import Number from './number.svelte'
  import { onDestroy, onMount } from 'svelte'
  import * as MapDir from '../../twmap/mapdir'
  import type { Writable } from 'svelte/store'

  export let g: number

  let syncClipX: Writable<number>
  let syncClipY: Writable<number>
  let syncClipW: Writable<number>
  let syncClipH: Writable<number>

  $: group = $map.groups[g]

  $: syncName = sync($server, group.name, {
    query: 'map/post/group',
    match: [g, { name: pick }],
    send: s => [g, { name: s }],
  })
  $: syncOrder = sync($server, g, {
    query: 'map/patch/group',
    match: [g, pick],
    send: s => [g, s],
  })
  $: syncOffX = sync($server, group.offX, {
    query: 'map/post/group',
    match: [g, { offset: { x: pick } }],
    apply: s => fromFixedNum(s, 5),
    send: s => [g, { offset: { x: toFixedNum(s, 5), y: toFixedNum($syncOffY, 5) } }],
  })
  $: syncOffY = sync($server, group.offY, {
    query: 'map/post/group',
    match: [g, { offset: { y: pick } }],
    apply: s => fromFixedNum(s, 5),
    send: s => [g, { offset: { x: toFixedNum($syncOffX, 5), y: toFixedNum(s, 5) } }],
  })
  $: syncParaX = sync($server, group.paraX, {
    query: 'map/post/group',
    match: [g, { parallax: { x: pick } }],
    send: s => [g, { parallax: { x: s, y: $syncParaY } }],
  })
  $: syncParaY = sync($server, group.paraY, {
    query: 'map/post/group',
    match: [g, { parallax: { y: pick } }],
    send: s => [g, { parallax: { x: $syncParaX, y: s } }],
  })
  $: syncClipping = sync($server, group.clipping, {
    query: 'map/post/group',
    match: [g, { clipping: pick }],
    send: s => [g, { clipping: s }],
  })
  $: {
    syncClipX = sync($server, group.clipX, {
      query: 'map/post/group',
      match: [g, { clip: { x: pick } }],
      apply: s => fromFixedNum(s, 5),
      send: s => [g, { clip: { x: toFixedNum(s, 5), y: toFixedNum($syncClipY, 5), w: toFixedNum($syncClipW, 5), h: toFixedNum($syncClipH, 5) } }],
    })
    syncClipY = sync($server, group.clipY, {
      query: 'map/post/group',
      match: [g, { clip: { y: pick } }],
      apply: s => fromFixedNum(s, 5),
      send: s => [g, { clip: { x: toFixedNum($syncClipX, 5), y: toFixedNum(s, 5), w: toFixedNum($syncClipW, 5), h: toFixedNum($syncClipH, 5) } }],
    })
    syncClipW = sync($server, group.clipW, {
      query: 'map/post/group',
      match: [g, { clip: { w: pick } }],
      apply: s => fromFixedNum(s, 5),
      send: s => [g, { clip: { x: toFixedNum($syncClipX, 5), y: toFixedNum($syncClipY, 5), w: toFixedNum(s, 5), h: toFixedNum($syncClipH, 5) } }],
    })
    syncClipH = sync($server, group.clipH, {
      query: 'map/post/group',
      match: [g, { clip: { h: pick } }],
      apply: s => fromFixedNum(s, 5),
      send: s => [g, { clip: { x: toFixedNum($syncClipX, 5), y: toFixedNum($syncClipY, 5), w: toFixedNum($syncClipW, 5), h: toFixedNum(s, 5) } }],
    })
  }

  let sync_ = null
  function onSync() {
    sync_ = sync_
  }

  onMount(() => {
    $server.on('map/put/layer', onSync)
    $server.on('map/delete/layer', onSync)
  })

  onDestroy(() => {
    $server.off('map/put/layer', onSync)
    $server.off('map/delete/layer', onSync)
  })

  function onCreateLayer(type: MapDir.LayerKind, name: string) {
    return function () {
      $server.query('map/put/layer', [g, { type, name }])
    }
  }

  function onDeleteGroup() {
    $server.query('map/delete/group', g)
  }

</script>

{#key sync_}
<div class="edit-group">
  <h3 class="bx--modal-header__heading">Group #{g} {$syncName}</h3>
  <Number label="Order" integer min={0} max={$map.groups.length - 1} bind:value={$syncOrder} />
  {#if group !== $map.physicsGroup()}
    <Number label="Pos X" integer bind:value={$syncOffX} />
    <Number label="Pos Y" integer bind:value={$syncOffY} />
    <Number label="Para X" integer bind:value={$syncParaX} />
    <Number label="Para Y" integer bind:value={$syncParaY} />
    <label>
      <span>Use Clipping</span>
      <input type="checkbox" bind:checked={$syncClipping} />
    </label>
    <Number label="X" integer disabled={!$syncClipping} bind:value={$syncClipX} />
    <Number label="Y" integer disabled={!$syncClipping} bind:value={$syncClipY} />
    <Number label="Width" integer disabled={!$syncClipping} bind:value={$syncClipW} />
    <Number label="Height" integer disabled={!$syncClipping} bind:value={$syncClipH} />
    <label>
      <span>Name</span>
      <input type="text" value={$syncName} maxlength={11} on:change={e => $syncName = e.currentTarget.value} />
    </label>
  {/if}
  <button class="default" on:click={onCreateLayer(MapDir.LayerKind.Tiles, '')}>
    Add tile layer
  </button>
  <button class="default" on:click={onCreateLayer(MapDir.LayerKind.Quads, '')}>
    Add quad layer
  </button>
  {#if group === $map.physicsGroup()}
    {#if !$map.physicsLayer(SwitchLayer)}
      <button class="default" on:click={onCreateLayer(MapDir.LayerKind.Switch, 'Switch')} >
        Add switch layer
      </button>
    {/if}
    {#if !$map.physicsLayer(FrontLayer)}
      <button class="default" on:click={onCreateLayer(MapDir.LayerKind.Front, 'Front')} >
        Add front layer
      </button>
    {/if}
    {#if !$map.physicsLayer(TuneLayer)}
      <button class="default" on:click={onCreateLayer(MapDir.LayerKind.Tune, 'Tune')} >
        Add tune layer
      </button>
    {/if}
    {#if !$map.physicsLayer(SpeedupLayer)}
      <button class="default" on:click={onCreateLayer(MapDir.LayerKind.Speedup, 'Speedup')} >
        Add speedup layer
      </button>
    {/if}
    {#if !$map.physicsLayer(TeleLayer)}
      <button class="default" on:click={onCreateLayer(MapDir.LayerKind.Tele, 'Tele')} >
        Add tele layer
      </button>
    {/if}
  {/if}
  {#if $map.groups[g] !== $map.physicsGroup()}
    <button class="danger large" on:click={onDeleteGroup}>Delete group</button>
  {/if}
</div>
{/key}
