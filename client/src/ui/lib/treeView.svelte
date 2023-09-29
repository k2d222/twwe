<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import type { Group } from '../../twmap/group'
  import type { Layer } from '../../twmap/layer'
  import { QuadsLayer } from '../../twmap/quadsLayer'
  import { AnyTilesLayer, TilesLayer } from '../../twmap/tilesLayer'
  import { rmap, selected, server } from '../global'
  import {
    View,
    ViewOff,
    CaretDown,
    GameConsole as GameLayerIcon,
    Grid as TilesLayerIcon,
    AreaCustom as QuadsLayerIcon,
    Unknown as UnknownLayerIcon,
    Layers as GroupIcon,
  } from 'carbon-icons-svelte'

  let folded = new Array($rmap.map.groups.length).fill(false)

  let self: HTMLElement
  let treeWalker: TreeWalker

  let active_g: number, active_l: number
  $: {
    if ($selected.length === 0) {
      active_g = -1
      active_l = -1
    }
    else {
      active_g = $selected[$selected.length - 1][0]
      active_l = $selected[$selected.length - 1][1]
    }
  }
  $: active = [active_g, active_l] as [number, number]

  $: if (self)
    treeWalker = document.createTreeWalker(self, NodeFilter.SHOW_ELEMENT, {
      acceptNode: node => {
        return node instanceof HTMLElement && node.classList.contains('node')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP
      },
    })

  // if active is changed, and some node is focused, focus active instead.
  $: if (self && active_g !== -1) {
    const focused = self.querySelector(':focus')
    if (focused) {
      const group = self.children[active_g]
      if (active_l === -1) {
        const node = group.firstElementChild as HTMLElement
        node.focus()
      } else {
        const layer = group.lastElementChild!.children[active_l]
        const node = layer.firstElementChild as HTMLElement
        node.focus()
      }
    }
  }

  let sync_ = 0
  function onSync() {
    sync_ = sync_ + 1
  }

  onMount(() => {
    $server.on('map/edit/group', onSync)
    $server.on('map/move/group', onSync)
    $server.on('map/create/group', onSync)
    $server.on('map/delete/group', onSync)
    $server.on('map/edit/layer', onSync)
    $server.on('map/move/layer', onSync)
    $server.on('map/create/layer', onSync)
    $server.on('map/delete/layer', onSync)
  })

  onDestroy(() => {
    $server.off('map/edit/group', onSync)
    $server.off('map/move/group', onSync)
    $server.off('map/create/group', onSync)
    $server.off('map/delete/group', onSync)
    $server.off('map/edit/layer', onSync)
    $server.off('map/move/layer', onSync)
    $server.off('map/create/layer', onSync)
    $server.off('map/delete/layer', onSync)
  })

  function layerName(layer: Layer) {
    if (layer.name) {
      return layer.name
    } else if ((layer instanceof QuadsLayer || layer instanceof TilesLayer) && layer.image) {
      return '<span style="font-style:italic">(' + layer.image.name + ')</span>'
    } else {
      return '…'
    }
  }

  function groupName(group: Group) {
    return group.name || '…'
  }

  function layerIcon(layer: Layer) {
    return layer instanceof TilesLayer
      ? TilesLayerIcon
      : layer instanceof AnyTilesLayer
      ? GameLayerIcon
      : layer instanceof QuadsLayer
      ? QuadsLayerIcon
      : UnknownLayerIcon
  }

  function select(g: number, l: number, e: MouseEvent | KeyboardEvent) {
    if (e.shiftKey && g === active_g) {
      $selected = [...$selected.filter(([_, l2]) => l2 !== -1 && l2 !== l), [g, l]]
    }
    else {
      $selected = [[g, l]]
    }
  }

  function onKeyDown(g: number, l: number, e: KeyboardEvent) {
    if (l === -1) {
      if (['ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
        e.preventDefault()
      }
      if (e.key === 'ArrowLeft') {
        folded[g] = true
      } else if (e.key == 'ArrowRight') {
        folded[g] = false
      } else if (e.key === 'Enter') {
        folded[g] = !folded[g]
        select(g, l, e)
      }
    } else {
      if (e.key === 'Enter') {
        select(g, l, e)
      }
    }
    if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault()
      treeWalker.currentNode = e.currentTarget as HTMLElement
      let node = e.key === 'ArrowUp' ? treeWalker.previousNode() : treeWalker.nextNode()
      if (node && node instanceof HTMLElement) {
        node.focus()
      }
    }
  }

  function isSelected(selected: [number, number][], g: number, l: number) {
    return selected.findIndex(([sg, sl]) => sg === g && sl === l) !== -1
  }

  function isActive(active: [number, number], g: number, l: number) {
    const [ag, al] = active
    return ag === g && al === l
  }
</script>

{#key sync_}
<ul id="tree" role="tree" bind:this={self}>
  {#each $rmap.groups as rgroup, g (rgroup)}
    {@const group = rgroup.group}
    <li class="group" class:visible={rgroup.visible} class:folded={folded[g]}>
      <div
        class="node"
        role="treeitem"
        tabindex="0"
        aria-selected={isSelected($selected, g, -1)}
        class:selected={isSelected($selected, g, -1)}
        class:active={isActive(active, g, -1)}
        on:click={(e) => select(g, -1, e)}
        on:keydown={e => onKeyDown(g, -1, e)}
      >
        <span class="toggle" aria-hidden="true" on:click={() => (folded[g] = !folded[g])}>
          <CaretDown />
        </span>
        <span class="icon"><GroupIcon /></span>
        <span class="label">{groupName(group)}</span>
        <span class="eye" aria-hidden="true" on:click={() => (rgroup.visible = !rgroup.visible)}>
          <svelte:component this={rgroup.visible ? View : ViewOff} />
        </span>
      </div>

      <ul>
        {#each rgroup.layers as rlayer, l (rlayer)}
          {@const layer = rlayer.layer}
          <li class="layer" class:visible={rlayer.visible}>
            <div
              class="node"
              role="treeitem"
              tabindex="0"
              aria-selected={isSelected($selected, g, l)}
              class:selected={isSelected($selected, g, l)}
              class:active={isActive(active, g, l)}
              on:click={(e) => select(g, l, e)}
              on:keydown={e => onKeyDown(g, l, e)}
            >
              <span class="icon"><svelte:component this={layerIcon(layer)} /></span>
              <span class="label">{@html layerName(layer)}</span>
              <span
                class="eye"
                aria-hidden="true"
                on:click={() => (rlayer.visible = !rlayer.visible)}
              >
                <svelte:component this={rlayer.visible ? View : ViewOff} />
              </span>
            </div>
          </li>
        {/each}
      </ul>
    </li>
  {/each}
</ul>
{/key}
