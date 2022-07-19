<script lang="ts">
  import type { EditLayer, DeleteLayer, ReorderLayer } from '../../server/protocol'
  import type { RenderMap } from '../../gl/renderMap'
  import type { Layer } from '../../twmap/layer'
  import type { Color } from '../../twmap/types'
  import { TilesLayerFlags } from '../../twmap/types'
  import { AnyTilesLayer, TilesLayer, GameLayer } from '../../twmap/tilesLayer'
  import { QuadsLayer } from '../../twmap/quadsLayer'
  import { showInfo, showError, clearDialog } from '../lib/dialog'
  import { server } from '../global'
  import { decodePng, externalImageUrl, queryImage, isPhysicsLayer } from './util'
  import { Image } from '../../twmap/image'
  import ImagePicker from './imagePicker.svelte'
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher()
  
  export let rmap: RenderMap
  export let g: number
  export let l: number

  $: rgroup = rmap.groups[g]
  $: group = rgroup.group
  $: rlayer = rgroup.layers[l]
  $: layer = rlayer.layer

  function intVal(target: EventTarget) {
    return parseInt((target as HTMLInputElement).value)
  }

  function strVal(target: EventTarget) {
    return (target as HTMLInputElement).value
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

  async function onEditLayer(change: EditLayer) {
    try {
      showInfo('Please wait…')
      await server.query('editlayer', change)
      rmap.editLayer(change)
      clearDialog()
      dispatch('change')
    } catch (e) {
      showError('Failed to edit layer: ' + e)
    }
  }
  async function onReorderLayer(change: ReorderLayer) {
    try {
      showInfo('Please wait…')
      await server.query('reorderlayer', change)
      rmap.reorderLayer(change)
      clearDialog()
      dispatch('change')
    } catch (e) {
      showError('Failed to reorder layer: ' + e)
    }
  }
  async function onDeleteLayer(change: DeleteLayer) {
    try {
      showInfo('Please wait…')
      await server.query('deletelayer', change)
      rmap.deleteLayer(change)
      clearDialog()
      dispatch('change')
    } catch (e) {
      showError('Failed to delete layer: ' + e)
    }
  }

  function layerName(layer: Layer) {
    const quotedName = layer.name ? " '" + layer.name + "'" : ""
    if (layer instanceof AnyTilesLayer) {
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

  function openFilePicker() {
    if (!(layer instanceof TilesLayer) && !(layer instanceof QuadsLayer))
      return

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


</script>


<div class="edit-layer">
  <span>{layerName(layer)}</span>
  {#if !isPhysicsLayer(layer)}
    <label>Group <input type="number" min={0} max={rmap.groups.length - 1} value={g}
      on:change={(e) => onReorderLayer({ group: g, layer: l, newGroup: intVal(e.target), newLayer: 0 })}></label>
  {/if}
  <label>Order <input type="number" min={0} max={group.layers.length - 1} value={l}
    on:change={(e) => onReorderLayer({ group: g, layer: l, newGroup: g, newLayer: intVal(e.target) })}></label>
  {#if layer instanceof AnyTilesLayer}
    <label>Width <input type="number" min={2} max={10000} value={layer.width}
      on:change={(e) => onEditLayer({ group: g, layer: l, width: intVal(e.target) })}></label>
    <label>Height <input type="number" min={2} max={10000} value={layer.height}
      on:change={(e) => onEditLayer({ group: g, layer: l, height: intVal(e.target) })}></label>
  {/if}
  {#if layer instanceof TilesLayer}
    {#if layer instanceof TilesLayer}
      {@const img = layer.image ? layer.image.name : "<none>" }
      <label>Image <input type="button" value={img}
        on:click={openFilePicker}></label>
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
      on:click={openFilePicker}></label>
    <label>Name <input type="text" value={layer.name} maxlength={11}
      on:change={(e) => onEditLayer({ group: g, layer: l, name: strVal(e.target) })}></label>
  {/if}
  {#if !(layer instanceof GameLayer)}
    <button
      on:click={() => onDeleteLayer({ group: g, layer: l })}>
      Delete layer
    </button>
  {/if}
</div>
