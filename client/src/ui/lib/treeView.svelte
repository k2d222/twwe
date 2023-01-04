<script lang="ts">
  import type { RenderMap } from '../../gl/renderMap'
  import type { Group } from '../../twmap/group'
  import type { Layer } from '../../twmap/layer'
  import { QuadsLayer } from '../../twmap/quadsLayer'
  import { AnyTilesLayer, TilesLayer } from '../../twmap/tilesLayer'
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

  export let rmap: RenderMap
  export let active: [number, number] = [-1, -1]
  export let selected: [number, number][] = [active]

  let folded = new Array(rmap.map.groups.length).fill(false)

  let self: HTMLElement
  let treeWalker: TreeWalker

  $: if (self)
    treeWalker = document.createTreeWalker(self, NodeFilter.SHOW_ELEMENT, {
      acceptNode: node => {
        return node instanceof HTMLElement && node.classList.contains('node')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP
      },
    })

  // if active is changed, and some node is focused, focus active instead.
  $: if (self && active[0] !== -1) {
    const focused = self.querySelector(':focus')
    if (focused) {
      const [g, l] = active
      const group = self.children[g]
      if (l === -1) {
        const node = group.firstElementChild as HTMLElement
        node.focus()
      } else {
        const layer = group.lastElementChild.children[l]
        const node = layer.firstElementChild as HTMLElement
        node.focus()
      }
    }
  }

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

  function select(g: number, l: number) {
    active = [g, l]
    selected = [active]
  }

  function onKeyDown(g: number, l: number, e: KeyboardEvent) {
    if (l === -1) {
      if (['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
      }
      if (e.key === 'ArrowLeft') {
        folded[g] = true
      } else if (e.key == 'ArrowRight') {
        folded[g] = false
      } else if (e.key === 'Enter' || e.key === ' ') {
        folded[g] = !folded[g]
        select(g, l)
      }
    } else {
      if (e.key === 'Enter' || e.key === ' ') {
        select(g, l)
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

<ul id="tree" role="tree" bind:this={self}>
  {#each rmap.groups as rgroup, g}
    {@const group = rgroup.group}
    <li class="group" class:visible={rgroup.visible} class:folded={folded[g]}>
      <div
        class="node"
        role="treeitem"
        tabindex="0"
        aria-selected={isSelected(selected, g, -1)}
        class:selected={isSelected(selected, g, -1)}
        class:active={isActive(active, g, -1)}
        on:click={() => select(g, -1)}
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
        {#each rgroup.layers as rlayer, l}
          {@const layer = rlayer.layer}
          <li class="layer" class:visible={rlayer.visible}>
            <div
              class="node"
              role="treeitem"
              tabindex="0"
              aria-selected={isSelected(selected, g, l)}
              class:selected={isSelected(selected, g, l)}
              class:active={isActive(active, g, l)}
              on:click={() => select(g, l)}
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
