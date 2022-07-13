<script lang="ts">
  import type { CreateGroup, EditGroup, DeleteGroup, ReorderGroup, CreateLayer, EditLayer, DeleteLayer, ReorderLayer } from '../../server/protocol'
  import type { RenderMap } from '../../gl/renderMap'
  import type { Color } from '../../twmap/types'
  import type { Layer } from '../../twmap/layer'
  import { TilesLayerFlags } from '../../twmap/types'
  import { Image } from '../../twmap/image'
  import { TilesLayer } from '../../twmap/tilesLayer'
  import { QuadsLayer } from '../../twmap/quadsLayer'
  import ContextMenu from './contextMenu.svelte'
  import ImagePicker from './imagePicker.svelte'
  import { decodePng, externalImageUrl, queryImage, isPhysicsLayer } from './util'
  import { showInfo, showError, clearDialog } from '../lib/dialog'
  import { server } from '../global'

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

  function select(g: number, l: number) {
    // WARN: There is a dependency cycle here between strSelected and selected and I'm not
    // sure how well svelte handles this.
    strSelected = toStr(g, l)
  }

  let strSelected = toStr(...selected)
  $: selected = fromStr(strSelected)
  $: select(...selected)
  
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

  async function onEditLayer(change: EditLayer) {
    try {
      showInfo('Please wait…')
      await server.query('editlayer', change)
      rmap.editLayer(change)
      rmap = rmap // hack to redraw treeview
      clearDialog()
    } catch (e) {
      showError('Failed to edit layer: ' + e)
    }
  }
  async function onEditGroup(change: EditGroup) {
    try {
      showInfo('Please wait…')
      await server.query('editgroup', change)
      rmap.editGroup(change)
      rmap = rmap // hack to redraw treeview
      clearDialog()
    } catch (e) {
      showError('Failed to edit group: ' + e)
    }
  }
  async function onCreateGroup() {
    try {
      const change: CreateGroup = { name: "" }
      showInfo('Please wait…')
      await server.query('creategroup', change)
      rmap.createGroup(change)
      rmap = rmap // hack to redraw treeview
      clearDialog()
    } catch (e) {
      showError('Failed to create group: ' + e)
    }
  }
  async function onCreateLayer(change: CreateLayer) {
    try {
      showInfo('Please wait…')
      await server.query('createlayer', change)
      rmap.createLayer(change)
      rmap = rmap // hack to redraw treeview
      clearDialog()
    } catch (e) {
      showError('Failed to create layer: ' + e)
    }
  }
  async function onReorderGroup(change: ReorderGroup) {
    try {
      showInfo('Please wait…')
      await server.query('reordergroup', change)
      const [ g, l ] = selected
      const group = rmap.groups[g]
      rmap.reorderGroup(change)
      select(rmap.groups.indexOf(group), l)
      rmap = rmap // hack to redraw treeview
      clearDialog()
    } catch (e) {
      showError('Failed to reorder group: ' + e)
    }
    hideCM()
  }
  async function onReorderLayer(change: ReorderLayer) {
    try {
      showInfo('Please wait…')
      await server.query('reorderlayer', change)
      const [ g, l ] = selected
      const layer = rmap.groups[g].layers[l]
      rmap.reorderLayer(change)
      const newGroup = rmap.groups.find(g => g.layers.includes(layer))
      select(rmap.groups.indexOf(newGroup), newGroup.layers.indexOf(layer))
      rmap = rmap // hack to redraw treeview
      clearDialog()
    } catch (e) {
      showError('Failed to reorder layer: ' + e)
    }
    hideCM()
  }
  async function onDeleteGroup(change: DeleteGroup) {
    try {
      showInfo('Please wait…')
      await server.query('deletegroup', change)
      const [ g, l ] = selected
      const group = rmap.groups[g]
      rmap.deleteGroup(change)
      if (change.group === g) {
        select(-1, -1)
      }
      else {
        select(rmap.groups.indexOf(group), l)
      }
      rmap = rmap // hack to redraw treeview
      clearDialog()
    } catch (e) {
      showError('Failed to delete group: ' + e)
    }
    hideCM()
  }
  async function onDeleteLayer(change: DeleteLayer) {
    try {
      showInfo('Please wait…')
      await server.query('deletelayer', change)
      const [ g, l ] = selected
      const layer = rmap.groups[g].layers[l]
      rmap.deleteLayer(change)
      if (change.group === g && change.layer === l) {
        select(-1, -1)
      }
      else {
        const newGroup = rmap.groups.find(g => g.layers.includes(layer))
        select(rmap.groups.indexOf(newGroup), newGroup.layers.indexOf(layer))
      }
      rmap = rmap // hack to redraw treeview
      clearDialog()
    } catch (e) {
      showError('Failed to delete layer: ' + e)
    }
    hideCM()
  }

  function openFilePicker(g: number, l: number, layer: TilesLayer | QuadsLayer) {
    const picker = new ImagePicker({
      target: document.body,
      props: {
        images: rmap.map.images,
        image: layer.image
      },
    })

    picker.$on('pick', async (e: Event & { detail: Image | string | null }) => {
      picker.$destroy()
      const image = e.detail

      if (image === null) { // no image used
        onEditLayer({ group: g, layer: l, image: null })
      }
      else if (image instanceof Image) { // use embedded image
        const index = rmap.map.images.indexOf(image)
        onEditLayer({ group: g, layer: l, image: index })
      }
      else { // new external image
        const index = rmap.map.images.length
        const url = externalImageUrl(image)
        const embed = await showInfo('Do you wish to embed this image?', 'yesno');
        if (embed) {
          try {
            showInfo('Uploading image...', 'none')
            const resp = await fetch(url)
            const file = await resp.arrayBuffer()
            await server.uploadFile(file)
            await server.query('createimage', { name: image, index, external: false })
            const img = await queryImage({ index })
            rmap.addImage(img)
            onEditLayer({ group: g, layer: l, image: index })
            clearDialog()
          }
          catch (e) {
            showError('Failed to upload image: ' + e)
          }
        }
        else {
          try {
            showInfo('Creating image...', 'none')
            const index = rmap.map.images.length
            await server.query('createimage', { name: image, index, external: true })
            const img = new Image()
            img.loadExternal(url)
            img.name = image
            rmap.addImage(img)
            onEditLayer({ group: g, layer: l, image: index })
            clearDialog()
          }
          catch (e) {
            showError('Failed to create external image: ' + e)
          }
        }
      }
    })

    picker.$on('upload', async (e: Event & { detail: File }) => {
      const image = e.detail
      try {
        showInfo('Uploading image...', 'none')
        const name = image.name.replace(/\.[^\.]+$/, '')
        const index = rmap.map.images.length
        await server.uploadFile(await image.arrayBuffer())
        await server.query('createimage', { name, index, external: false })
        const data = await decodePng(image)
        const img = new Image()
        img.loadEmbedded(data)
        img.name = name
        rmap.addImage(img)
        picker.$set({ images: rmap.map.images })
        clearDialog()
      }
      catch (e) {
        showError('Failed to upload image: ' + e)
      }
    })

    picker.$on('delete', async (e: Event & { detail: Image }) => {
      const image = e.detail

      try {
        const index = rmap.map.images.indexOf(image)
        await server.query('deleteimage', { index })
        rmap.removeImage(index)
        picker.$set({ images: rmap.map.images })
      }
      catch (e) {
        showError('Failed to delete image: ' + e)
      }
    })

    picker.$on('cancel', () => {
      picker.$destroy()
    })
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
  
  function layerName(layer: Layer) {
    const quotedName = layer.name ? " '" + layer.name + "'" : ""
    if (layer instanceof TilesLayer) {
      switch (layer.flags) {
        case TilesLayerFlags.FRONT:
          return "Front Layer"
        case TilesLayerFlags.GAME:
          return "Game Layer"
        case TilesLayerFlags.SPEEDUP:
          return "Speedup Layer"
        case TilesLayerFlags.SWITCH:
          return "Switch Layer"
        case TilesLayerFlags.TELE:
          return "Tele Layer"
        case TilesLayerFlags.TILES:
          return "Tile Layer" + quotedName
        case TilesLayerFlags.TUNE:
          return "Tune Layer"
      }
    }
    else if (layer instanceof QuadsLayer) {
      return "Quad Layer" + quotedName
    }
    else {
      return "Layer" + quotedName
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
          <span class="eye"
            on:click={() => rgroup.visible = !rgroup.visible}></span>
          <span class="options"
              on:click={(e) => showCM(e, g)}></span>

          {#if cm.g === g && cm.l === null}
            <ContextMenu x={cmX} y={cmY} on:close={hideCM}>
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
              <label>Name <input type="text" value={group.name}
                on:change={(e) => onEditGroup({ group: g, name: strVal(e.target) })}></label>
              <button
                on:click={() => onCreateLayer({ kind: 'tiles', group: g, name: "" })}>
                Add tile layer
              </button>
              <button
                on:click={() => onCreateLayer({ kind: 'quads', group: g, name: "" })}>
                Add quad layer
              </button>
              {#if rgroup === rmap.physicsGroup}
                {#if !rmap.findPhysicsLayer(TilesLayerFlags.SWITCH)}
                  <button
                    on:click={() => onCreateLayer({ kind: 'switch', group: g, name: "" })}>
                    Add switch layer
                  </button>
                {/if}
                {#if !rmap.findPhysicsLayer(TilesLayerFlags.FRONT)}
                  <button
                    on:click={() => onCreateLayer({ kind: 'front', group: g, name: "" })}>
                    Add front layer
                  </button>
                {/if}
                {#if !rmap.findPhysicsLayer(TilesLayerFlags.TUNE)}
                  <button
                    on:click={() => onCreateLayer({ kind: 'tune', group: g, name: "" })}>
                    Add tune layer
                  </button>
                {/if}
                {#if !rmap.findPhysicsLayer(TilesLayerFlags.SPEEDUP)}
                  <button
                    on:click={() => onCreateLayer({ kind: 'speedup', group: g, name: "" })}>
                    Add speedup layer
                  </button>
                {/if}
                {#if !rmap.findPhysicsLayer(TilesLayerFlags.TELE)}
                  <button
                    on:click={() => onCreateLayer({ kind: 'tele', group: g, name: "" })}>
                    Add tele layer
                  </button>
                {/if}
              {/if}
              <button
                on:click={() => onDeleteGroup({ group: g })}>
                Delete group
              </button>
            </ContextMenu>
          {/if}

        </div>
    
        {#each rgroup.layers as rlayer, l}
          {@const layer = rlayer.layer}
          <div class="layer" class:visible={rlayer.visible}>
            <label>
              <input name="layer" type="radio" bind:group={strSelected} value={toStr(g, l)} disabled={!(layer instanceof TilesLayer)} />
              {layer.name || '<no name>'}
            </label>
            <span class="eye"
              on:click={() => rlayer.visible = !rlayer.visible}></span>
            <span class="options"
              on:click={(e) => showCM(e, g, l)}></span>

            {#if cm.g === g && cm.l === l}
              <ContextMenu x={cmX} y={cmY} on:close={hideCM}>
                <span>{layerName(layer)}</span>
                {#if !isPhysicsLayer(layer)}
                  <label>Group <input type="number" min={0} max={rmap.groups.length - 1} value={g}
                    on:change={(e) => onReorderLayer({ group: g, layer: l, newGroup: intVal(e.target), newLayer: 0 })}></label>
                {/if}
                <label>Order <input type="number" min={0} max={group.layers.length - 1} value={l}
                  on:change={(e) => onReorderLayer({ group: g, layer: l, newGroup: g, newLayer: intVal(e.target) })}></label>
                {#if layer instanceof TilesLayer}
                  <label>Width <input type="number" min={2} max={10000} value={layer.width}
                    on:change={(e) => onEditLayer({ group: g, layer: l, width: intVal(e.target) })}></label>
                  <label>Height <input type="number" min={2} max={10000} value={layer.height}
                    on:change={(e) => onEditLayer({ group: g, layer: l, height: intVal(e.target) })}></label>
                  {#if layer instanceof TilesLayer}
                    {@const img = layer.image ? layer.image.name : "<none>" }
                    <label>Image <input type="button" value={img}
                      on:click={() => openFilePicker(g, l, layer)}></label>
                    {@const col = layer.color}
                    <label>Color <input type="color" value={colorToStr(layer.color)}
                      on:change={(e) => onEditLayer({ group: g, layer: l, color: strToColor(strVal(e.target), col.a) })}></label>
                    <label>Opacity <input type="range" min={0} max={255} value={col.a}
                      on:change={(e) => onEditLayer({ group: g, layer: l, color: { ...col, a: intVal(e.target) } })}></label>
                    {#if layer.flags === TilesLayerFlags.TILES}
                      <label>Name <input type="text" value={layer.name}
                        on:change={(e) => onEditLayer({ group: g, layer: l, name: strVal(e.target) })}></label>
                    {/if}
                  {/if}
                {:else if layer instanceof QuadsLayer}
                  {@const img = layer.image ? layer.image.name : "<none>" }
                  <label>Image <input type="button" value={img}
                    on:click={() => openFilePicker(g, l, layer)}></label>
                  <label>Name <input type="text" value={layer.name}
                    on:change={(e) => onEditLayer({ group: g, layer: l, name: strVal(e.target) })}></label>
                {/if}
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
