<script lang="ts">
  import type {
    CreateLayer,
    RequestContent,
  } from '../../server/protocol'
  import {
    SwitchLayer,
    TuneLayer,
    FrontLayer,
    SpeedupLayer,
    TeleLayer,
  } from '../../twmap/tilesLayer'
  import { fromFixedNum, toFixedNum } from '../../server/convert'
  import { selected, map, server } from '../global'
  import { sync } from '../../server/util'
  import Number from './number.svelte'
  import { onDestroy, onMount } from 'svelte'

  let g: number
  $: {
    if ($selected.length === 0) {
      g = -1
    }
    else {
      g = $selected[$selected.length - 1][0]
    }
  }

  $: group = $map.groups[g]

  $: syncName = sync(group.name, {
    server: $server,
    query: 'editgroup',
    send: s => ({ group: g, name: s }),
    recv: e => e.group === g && 'name' in e ? e.name : null,
  })
  $: syncOrder = sync(g, {
    server: $server,
    query: 'reordergroup',
    send: s => ({ group: g, newGroup: s }),
    recv: e => e.group === g ? e.newGroup : null,
  })
  $: syncOffX = sync(group.offX, {
    server: $server,
    query: 'editgroup',
    send: s => ({ group: g, offX: toFixedNum(s, 5) }),
    recv: e => e.group === g && 'offX' in e ? fromFixedNum(e.offX, 5) : null,
  })
  $: syncOffY = sync(group.offY, {
    server: $server,
    query: 'editgroup',
    send: s => ({ group: g, offY: toFixedNum(s, 5) }),
    recv: e => e.group === g && 'offY' in e ? fromFixedNum(e.offY, 5) : null,
  })
  $: syncParaX = sync(group.paraX, {
    server: $server,
    query: 'editgroup',
    send: s => ({ group: g, paraX: s }),
    recv: e => e.group === g && 'paraX' in e ? e.paraX : null,
  })
  $: syncParaY = sync(group.paraY, {
    server: $server,
    query: 'editgroup',
    send: s => ({ group: g, paraY: s }),
    recv: e => e.group === g && 'paraY' in e ? e.paraY : null,
  })
  $: syncClipping = sync(group.clipping, {
    server: $server,
    query: 'editgroup',
    send: s => ({ group: g, clipping: s }),
    recv: e => e.group === g && 'clipping' in e ? e.clipping : null,
  })
  $: syncClipX = sync(group.clipX, {
    server: $server,
    query: 'editgroup',
    send: s => ({ group: g, clipX: toFixedNum(s, 5) }),
    recv: e => e.group === g && 'clipX' in e ? fromFixedNum(e.clipX, 5) : null,
  })
  $: syncClipY = sync(group.clipY, {
    server: $server,
    query: 'editgroup',
    send: s => ({ group: g, clipY: toFixedNum(s, 5) }),
    recv: e => e.group === g && 'clipY' in e ? fromFixedNum(e.clipY, 5) : null,
  })
  $: syncClipW = sync(group.clipW, {
    server: $server,
    query: 'editgroup',
    send: s => ({ group: g, clipW: toFixedNum(s, 5) }),
    recv: e => e.group === g && 'clipW' in e ? fromFixedNum(e.clipW, 5) : null,
  })
  $: syncClipH = sync(group.clipH, {
    server: $server,
    query: 'editgroup',
    send: s => ({ group: g, clipH: toFixedNum(s, 5) }),
    recv: e => e.group === g && 'clipH' in e ? fromFixedNum(e.clipH, 5) : null,
  })


  let sync_ = null
  function onSync() {
    sync_ = sync_
  }

  onMount(() => {
    $server.on('createlayer', onSync)
    $server.on('deletelayer', onSync)
  })

  onDestroy(() => {
    $server.off('createlayer', onSync)
    $server.off('deletelayer', onSync)
  })

  function onCreateLayer(kind: CreateLayer['kind'], name: string) {
    return function () {
      $server.query('createlayer', { group: g, kind, name })
    }
  }

  function onDeleteGroup() {
    $server.query('deletegroup', { group: g })
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
  <button class="default" on:click={onCreateLayer('tiles', '')}>
    Add tile layer
  </button>
  <button class="default" on:click={onCreateLayer('quads', '')}>
    Add quad layer
  </button>
  {#if group === $map.physicsGroup()}
    {#if !$map.physicsLayer(SwitchLayer)}
      <button class="default" on:click={onCreateLayer('switch', 'Switch')} >
        Add switch layer
      </button>
    {/if}
    {#if !$map.physicsLayer(FrontLayer)}
      <button class="default" on:click={onCreateLayer('front', 'Front')} >
        Add front layer
      </button>
    {/if}
    {#if !$map.physicsLayer(TuneLayer)}
      <button class="default" on:click={onCreateLayer('tune', 'Tune')} >
        Add tune layer
      </button>
    {/if}
    {#if !$map.physicsLayer(SpeedupLayer)}
      <button class="default" on:click={onCreateLayer('speedup', 'Speedup')} >
        Add speedup layer
      </button>
    {/if}
    {#if !$map.physicsLayer(TeleLayer)}
      <button class="default" on:click={onCreateLayer('tele', 'Tele')} >
        Add tele layer
      </button>
    {/if}
  {/if}
  {#if $map.groups[g] !== $map.physicsGroup()}
    <button class="danger large" on:click={onDeleteGroup}>Delete group</button>
  {/if}
</div>
{/key}