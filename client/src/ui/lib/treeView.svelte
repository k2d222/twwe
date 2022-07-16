<script lang="ts">
  import type { CreateGroup } from '../../server/protocol'
  import type { RenderMap } from '../../gl/renderMap'
  import type { RenderLayer } from '../../gl/renderLayer'
  import { QuadsLayer } from '../../twmap/quadsLayer'
  import ContextMenu from './contextMenu.svelte'
  import GroupEditor from './editGroup.svelte'
  import LayerEditor from './editLayer.svelte'
  import { showInfo, showError, clearDialog } from '../lib/dialog'
  import { server } from '../global'

  export let rmap: RenderMap
  export let visible = true

  export let g = -1
  export let l = -1
  $: rgroup = g !== -1 ? rmap.groups[g] : null
  $: rlayer = rgroup && l !== -1 ? rgroup.layers[l] : null

  let folded = new Array(rmap.groups.length).fill(false)

  function toStr(g: number, l: number) {
    return `${g},${l}`
  }

  function fromStr(str: string) {
    return str.split(',').map(x => parseInt(x)) as [number, number]
  }

  let strSelected = toStr(g, l)
  $: select(...fromStr(strSelected))

  function select(new_g: number, new_l: number) {
    for (const rgroup of rmap.groups)
      for (const rlayer of rgroup.layers)
        rlayer.active = false

    if (new_g !== -1 && new_l !== -1) {
      const rlayer = rmap.groups[new_g].layers[new_l] // new_g and new_l are supposed to be valid
      rlayer.active = true
    }

    g = new_g
    l = new_l
    strSelected = toStr(new_g, new_l)
  }
  
  // ContextMenu
  let cm_g = -1
  let cm_l = -1
  $: cm_rgroup = cm_g !== -1 ? rmap.groups[cm_g] : null
  $: cm_rlayer = cm_rgroup && cm_l !== -1 ? cm_rgroup.layers[cm_l] : null
  let cm_x = 0
  let cm_y = 0

  function showCM(e: MouseEvent, g: number, l: number = -1) {
    cm_x = e.clientX
    cm_y = e.clientY
    cm_g = g
    cm_l = l
  }

  function hideCM() {
    cm_g = -1
    cm_l = -1
  }

  async function onCreateGroup() {
    try {
      const change: CreateGroup = { name: "" }
      showInfo('Please wait…')
      await server.query('creategroup', change)
      rmap.createGroup(change)
      rmap = rmap // hack to redraw the treeview
      clearDialog()
    } catch (e) {
      showError('Failed to create group: ' + e)
    }
  }

  function layerIndex(rlayer: RenderLayer): [number, number] {
    for (let g = 0; g < rmap.groups.length; g++) {
      const rgroup = rmap.groups[g]
      for (let l = 0; l < rgroup.layers.length; l++) {
        if (rgroup.layers[l] === rlayer) {
          return [ g, l ]
        }
      }
    }

    return [ -1, -1 ]
  }

  function onChange() {
    if (rlayer) {
      const [ new_g, new_l ] = layerIndex(rlayer)
      if (new_g !== g || new_l !== l) {
        select(new_g, new_l)
        rmap = rmap
      }
    }
    if (cm_rlayer) {
      const [ new_g, new_l ] = layerIndex(cm_rlayer)
      if (new_g !== cm_g || new_l !== cm_l) {
        cm_g = new_g
        cm_l = new_l
        rmap = rmap
      }
    }
    else if (cm_rgroup) {
      const new_g = rmap.groups.indexOf(cm_rgroup)
      if (new_g !== g) {
        cm_g = new_g
        rmap = rmap
      }
    }
  }

</script>

<nav class:hidden={!visible}>
  <div id="tree">

    {#each rmap.groups as rgroup, g}
      {@const group = rgroup.group}
      <div class="group" class:visible={rgroup.visible} class:folded={folded[g]}>
        <div class="title">
          <span class="fold"
            on:click={() => folded[g] = !folded[g]}></span>
          <b>#{g} {group.name}</b>
          <span class="eye" on:click={() => rgroup.visible = !rgroup.visible}></span>
          <span class="options" on:click={(e) => showCM(e, g)}></span>
          {#if cm_g === g && cm_l === -1}
            <ContextMenu x={cm_x} y={cm_y} on:close={hideCM}>
              <GroupEditor {rmap} {g} on:change={onChange} />
            </ContextMenu>
          {/if}
        </div>
    
        {#each rgroup.layers as rlayer, l}
          {@const layer = rlayer.layer}
          <div class="layer" class:visible={rlayer.visible}>
            <label>
              <input name="layer" type="radio" bind:group={strSelected} value={toStr(g, l)} disabled={layer instanceof QuadsLayer} />
              {layer.name || '<no name>'}
            </label>
            <span class="eye" on:click={() => rlayer.visible = !rlayer.visible}></span>
            <span class="options" on:click={(e) => showCM(e, g, l)}></span>
            {#if cm_g === g && cm_l === l}
              <ContextMenu x={cm_x} y={cm_y} on:close={hideCM}>
                <LayerEditor {rmap} {g} {l} on:change={onChange} />
              </ContextMenu>
            {/if}
          </div>
        {/each}

      </div>
    {/each}

    <button on:click={onCreateGroup}>Add group</button>

  </div>
</nav>
