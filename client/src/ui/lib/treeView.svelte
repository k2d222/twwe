<script lang="ts">
  import type { CreateGroup } from '../../server/protocol'
  import type { RenderMap } from '../../gl/renderMap'
  import type { Group } from '../../twmap/group'
  import type { Layer } from '../../twmap/layer'
  import { QuadsLayer } from '../../twmap/quadsLayer'
  import ContextMenu from './contextMenu.svelte'
  import GroupEditor from './editGroup.svelte'
  import LayerEditor from './editLayer.svelte'
  import { showInfo, showError, clearDialog } from '../lib/dialog'
  import { server } from '../global'

  export let rmap: RenderMap
  export let activeLayer: Layer
  export let visible = true

  let folded = new Array(rmap.map.groups.length).fill(false)

  let cm_group: Group | null = null
  let cm_layer: Layer | null = null
  let cm_x = 0
  let cm_y = 0

  function showCM(e: MouseEvent, group: Group | null, layer: Layer | null) {
    cm_x = e.clientX
    cm_y = e.clientY
    cm_group = group
    cm_layer = layer
  }

  function hideCM() {
    cm_group = null
    cm_layer = null
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

  function onChange() {
    activeLayer = activeLayer // hack to redraw the tileSelector
    rmap = rmap // hack to redraw the treeview
  }

</script>

<nav class:hidden={!visible}>
  <div id="tree">

    {#each rmap.groups as rgroup, g}
      {@const group = rgroup.group}
      <div class="group" class:visible={rgroup.visible} class:folded={folded[g]}>
        <div class="title">
          <span class="fold" on:click={() => folded[g] = !folded[g]}></span>
          <b>#{g} {group.name}</b>
          <span class="eye" on:click={() => rgroup.visible = !rgroup.visible}></span>
          <span class="options" on:click={(e) => showCM(e, group, null)}></span>
          {#if cm_group === group}
            <ContextMenu x={cm_x} y={cm_y} on:close={hideCM}>
              <GroupEditor {rmap} {g} on:change={onChange} />
            </ContextMenu>
          {/if}
        </div>
    
        {#each rgroup.layers as rlayer, l}
          {@const layer = rlayer.layer}
          <div class="layer" class:visible={rlayer.visible}>
            <label>
              <input name="layer" type="radio" on:change={() => activeLayer = layer} checked={layer === activeLayer} disabled={layer instanceof QuadsLayer} />
              {layer.name || '<no name>'}
            </label>
            <span class="eye" on:click={() => rlayer.visible = !rlayer.visible}></span>
            <span class="options" on:click={(e) => showCM(e, null, layer)}></span>
            {#if cm_layer === layer}
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
