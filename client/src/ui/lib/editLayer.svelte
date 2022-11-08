<script lang="ts">
  import type { EditLayer, DeleteLayer, ReorderLayer, RequestContent } from '../../server/protocol'
  import type { RenderMap } from '../../gl/renderMap'
  import type { Layer } from '../../twmap/layer'
  import type { Color } from '../../twmap/types'
  import type { FormEvent, FormInputEvent } from './util'
  import { TilesLayerFlags, LayerFlags } from '../../twmap/types'
  import { AnyTilesLayer, TilesLayer, GameLayer } from '../../twmap/tilesLayer'
  import { QuadsLayer } from '../../twmap/quadsLayer'
  import { showInfo, showError, clearDialog } from '../lib/dialog'
  import { server } from '../global'
  import { decodePng, externalImageUrl, queryImage, isPhysicsLayer } from './util'
  import { Image } from '../../twmap/image'
  import { ColorEnvelope } from '../../twmap/envelope'
  import ImagePicker from './imagePicker.svelte'
  import { createEventDispatcher } from 'svelte'
import { ComposedModal, ModalBody, ModalHeader } from 'carbon-components-svelte';

  type Events = 'createlayer' | 'editlayer' | 'reorderlayer' | 'deletelayer'
  type EventMap = { [K in Events]: RequestContent[K] }

  const dispatch = createEventDispatcher<EventMap>()
  
  export let rmap: RenderMap
  export let g: number
  export let l: number

  $: rgroup = rmap.groups[g]
  $: group = rgroup.group
  $: rlayer = rgroup.layers[l]
  $: layer = rlayer.layer as TilesLayer | QuadsLayer
  $: colorEnvelopes = rmap.map.envelopes.filter(e => e instanceof ColorEnvelope)
  
  $: images = rmap.map.images
  $: image = layer.image

  function parseI32(str: string) {
    return clamp(parseInt(str), -2_147_483_648, 2_147_483_647)
  }

  function clamp(cur: number, min: number, max: number) {
    return Math.min(Math.max(min, cur), max)
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

  function onEditLayer(change: EditLayer) {
    dispatch('editlayer', change)
  }
  function onReorderLayer(change: ReorderLayer) {
    dispatch('reorderlayer', change)
  }
  function onDeleteLayer(change: DeleteLayer) {
    dispatch('deletelayer', change)
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

  let imagePickerOpen = false

  async function onImagePick (e: Event & { detail: Image | string | null }) {
    imagePickerOpen = false
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
  }

  async function onImageUpload(e: Event & { detail: File }) {
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
      images = images // update the component
      clearDialog()
    }
    catch (e) {
      showError('Failed to upload image: ' + e)
    }
  }
  
  async function onImageDelete (e: Event & { detail: Image }) {
    const image = e.detail

    try {
      const index = rmap.map.images.indexOf(image)
      await server.query('deleteimage', { index })
      rmap.removeImage(index)
      images = images // update the component
    }
    catch (e) {
      imagePickerOpen = false
      showError('Failed to delete image: ' + e)
    }
  }
  
  function onEditGroup(e: FormInputEvent) {
    const newGroup = clamp(parseInt(e.currentTarget.value), 0, rmap.groups.length - 1)
    if (!isNaN(newGroup))
      onReorderLayer({ group: g, layer: l, newGroup, newLayer: 0 })
  }
  function onEditOrder(e: FormInputEvent) {
    const newLayer = clamp(parseInt(e.currentTarget.value), 0, group.layers.length - 1)
    if (!isNaN(newLayer))
      onReorderLayer({ group: g, layer: l, newGroup: g, newLayer })
  }
  function onEditWidth(e: FormInputEvent) {
    const width = clamp(parseInt(e.currentTarget.value), 2, 10000)
    if (!isNaN(width))
      onEditLayer({ group: g, layer: l, width })
  }
  function onEditHeight(e: FormInputEvent) {
    const height = clamp(parseInt(e.currentTarget.value), 2, 10000)
    if (!isNaN(height))
      onEditLayer({ group: g, layer: l, height })
  }
  function onEditDetail(_: FormInputEvent) {
    const flags = layer.detail ? LayerFlags.NONE : LayerFlags.DETAIL
    onEditLayer({ group: g, layer: l, flags })
  }
  function onEditColor(e: FormInputEvent) {
    if (layer instanceof TilesLayer) {
      const color = strToColor(e.currentTarget.value, layer.color.a)
      onEditLayer({ group: g, layer: l, color })
    }
  }
  function onEditOpacity(e: FormInputEvent) {
    if (layer instanceof TilesLayer) {
      const color = { ...layer.color, a: clamp(parseInt(e.currentTarget.value), 0, 255) }
      onEditLayer({ group: g, layer: l, color })
    }
  }
  function onEditColorEnv(e: FormEvent<HTMLSelectElement>) {
    if (layer instanceof TilesLayer) {
      const colorEnv = parseInt(e.currentTarget.value)
      onEditLayer({ group: g, layer: l, colorEnv })
    }
  }
  function onEditColorEnvOffset(e: FormInputEvent) {
    if (layer instanceof TilesLayer) {
      const colorEnvOffset = parseI32(e.currentTarget.value)
      if (!isNaN(colorEnvOffset))
        onEditLayer({ group: g, layer: l, colorEnvOffset })
    }
  }
  function onEditName(e: FormInputEvent) {
    const name = e.currentTarget.value.substring(0, 11)
    onEditLayer({ group: g, layer: l, name })
  }
  function onDelete() {
    onDeleteLayer({ group: g, layer: l })
  }

</script>


<div class="edit-layer">
  <h3 class="bx--modal-header__heading">{layerName(layer)}</h3>
  {#if !isPhysicsLayer(layer)}
    <label>Group <input type="number" min={0} max={rmap.groups.length - 1} value={g} on:change={onEditGroup} /></label>
  {/if}
  <label>Order <input type="number" min={0} max={group.layers.length - 1} value={l} on:change={onEditOrder} /></label>
  {#if layer instanceof AnyTilesLayer}
    <label>Width <input type="number" min={2} max={10000} value={layer.width} on:change={onEditWidth}></label>
    <label>Height <input type="number" min={2} max={10000} value={layer.height} on:change={onEditHeight}></label>
  {/if}
  {#if layer instanceof TilesLayer || layer instanceof QuadsLayer}
    <label>Detail <input type="checkbox" checked={layer.detail} on:change={onEditDetail}></label>
    {@const img = layer.image ? layer.image.name : "<none>" }
    <label>Image <input type="button" value={img} on:click={() => imagePickerOpen = true}></label>
  {/if}
  {#if layer instanceof TilesLayer}
    <label>Color <input type="color" value={colorToStr(layer.color)} on:change={onEditColor}></label>
    <label>Opacity <input type="range" min={0} max={255} value={layer.color.a} on:change={onEditOpacity}></label>
    <label>Color Envelope <select on:change={onEditColorEnv}>
      <option selected={layer.colorEnv === null} value={null}>None</option>
      {#each colorEnvelopes as env}
        {@const i = rmap.map.envelopes.indexOf(env)}
        <option selected={layer.colorEnv === env} value={i}>{'#' + i + ' ' + (env.name || '(unnamed)')}</option>
      {/each}
    </select></label>
    <label>Color Env. Offset <input type="number" value={layer.colorEnvOffset} on:change={onEditColorEnvOffset}></label>
  {/if}
  {#if layer instanceof TilesLayer || layer instanceof QuadsLayer}
    <label>Name <input type="text" value={layer.name} maxlength={11} on:change={onEditName}></label>
  {/if}
  {#if !(layer instanceof GameLayer)}
    <button class="danger large" on:click={onDelete}>Delete layer</button>
  {/if}
</div>

<ComposedModal bind:open={imagePickerOpen} size="lg">
  <ModalHeader title="Pick an image" />
  <ModalBody hasForm>
    <ImagePicker {images} {image}
      on:pick={onImagePick}
      on:cancel={() => imagePickerOpen = false}
      on:upload={onImageUpload}
      on:delete={onImageDelete}
    />
  </ModalBody>
</ComposedModal>
