<script lang="ts">
  import type { EditLayer, DeleteLayer, ReorderLayer, RequestContent } from '../../server/protocol'
  import type { Layer } from '../../twmap/layer'
  import type { Color } from '../../twmap/types'
  import { FormEvent, FormInputEvent, uploadImage } from './util'
  import { TilesLayerFlags, LayerFlags } from '../../twmap/types'
  import { AnyTilesLayer, TilesLayer, GameLayer } from '../../twmap/tilesLayer'
  import { QuadsLayer } from '../../twmap/quadsLayer'
  import { showInfo, showError, clearDialog } from '../lib/dialog'
  import { server, serverConfig, selected } from '../global'
  import { decodePng, externalImageUrl, isPhysicsLayer } from './util'
  import { Image } from '../../twmap/image'
  import { ColorEnvelope } from '../../twmap/envelope'
  import ImagePicker from './imagePicker.svelte'
  import { createEventDispatcher } from 'svelte'
  import { ComposedModal, ModalBody, ModalHeader } from 'carbon-components-svelte'
  import { rmap } from '../global'

  type Events = 'createlayer' | 'editlayer' | 'reorderlayer' | 'deletelayer'
  type EventMap = { [K in Events]: RequestContent[K] }

  const dispatch = createEventDispatcher<EventMap>()

  let g: number, l: number
  $: {
    if ($selected.length === 0) {
      g = -1
      l = -1
    }
    else {
      g = $selected[$selected.length - 1][0]
      l = $selected[$selected.length - 1][1]
    }
  }

  $: rgroup = g === -1 ? null : $rmap.groups[g]
  $: rlayer = l === -1 ? null : rgroup.layers[l]
  $: group = rgroup === null ? null : rgroup.group
  $: layer = rlayer === null ? null : rlayer.layer as TilesLayer | QuadsLayer
  $: colorEnvelopes = $rmap.map.envelopes.filter(e => e instanceof ColorEnvelope)

  $: images = $rmap.map.images
  $: image = layer === null ? null : layer.image

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
    const quotedName = layer.name ? " '" + layer.name + "'" : ''
    if (layer instanceof AnyTilesLayer) {
      switch (layer.flags) {
        case TilesLayerFlags.FRONT:
          return 'Front Layer'
        case TilesLayerFlags.GAME:
          return 'Game Layer'
        case TilesLayerFlags.SPEEDUP:
          return 'Speedup Layer'
        case TilesLayerFlags.SWITCH:
          return 'Switch Layer'
        case TilesLayerFlags.TELE:
          return 'Tele Layer'
        case TilesLayerFlags.TILES:
          return 'Tile Layer' + quotedName
        case TilesLayerFlags.TUNE:
          return 'Tune Layer'
      }
    } else if (layer instanceof QuadsLayer) {
      return 'Quad Layer' + quotedName
    } else {
      return 'Layer' + quotedName
    }
  }

  let imagePickerOpen = false

  async function onImagePick(e: Event & { detail: File | Image | string | null }) {
    imagePickerOpen = false

    if (e.detail === null) {
      // no image used
      onEditLayer({ group: g, layer: l, image: null })
    } else if (e.detail instanceof Image) {
      // use embedded image
      const index = $rmap.map.images.indexOf(e.detail)
      onEditLayer({ group: g, layer: l, image: index })
    } else if (e.detail instanceof File) {
      const name = e.detail.name.replace(/\.[^\.]+$/, '')
      uploadImageAndPick(e.detail, name)
    } else {
      const name = e.detail
      // new external image
      const url = externalImageUrl(e.detail)
      const embed = await showInfo('Do you wish to embed this image?', 'yesno')
      if (embed) {
        const resp = await fetch(url)
        const file = await resp.blob()
        const name = e.detail
        uploadImageAndPick(file, name)
      } else {
        try {
          showInfo('Creating image...', 'none')
          const index = $rmap.map.images.length
          await $server.query('createimage', { name, index, external: true })
          const img = new Image()
          img.loadExternal(url)
          img.name = name
          $rmap.addImage(img)
          onEditLayer({ group: g, layer: l, image: index })
          clearDialog()
        } catch (e) {
          showError('Failed to create external image: ' + e)
        }
      }
    }
  }

  async function uploadImageAndPick(file: Blob, name: string) {
    try {
      showInfo('Uploading image…', 'none')
      const index = $rmap.map.images.length
      const data = await decodePng(file)
      const img = new Image()
      img.loadEmbedded(data)
      img.name = name
      $rmap.addImage(img)
      await uploadImage($serverConfig.httpUrl, $rmap.map.name, file, {
        name,
        index,
      })
      onEditLayer({ group: g, layer: l, image: index })
      showInfo('Image uploaded and selected.')
    } catch (e) {
      showError('Failed to upload image: ' + e)
    }
    images = images // update the component
  }

  async function onImageDelete(e: Event & { detail: Image }) {
    const image = e.detail

    try {
      const index = $rmap.map.images.indexOf(image)
      await $server.query('deleteimage', { index })
      $rmap.removeImage(index)
      images = images // update the component
    } catch (e) {
      showError('Failed to delete image: ' + e)
    }
  }

  function onEditGroup(e: FormInputEvent) {
    const newGroup = clamp(parseInt(e.currentTarget.value), 0, $rmap.groups.length - 1)
    if (!isNaN(newGroup)) onReorderLayer({ group: g, layer: l, newGroup, newLayer: 0 })
  }
  function onEditOrder(e: FormInputEvent) {
    const newLayer = clamp(parseInt(e.currentTarget.value), 0, group.layers.length - 1)
    if (!isNaN(newLayer)) onReorderLayer({ group: g, layer: l, newGroup: g, newLayer })
  }
  function onEditWidth(e: FormInputEvent) {
    const width = clamp(parseInt(e.currentTarget.value), 2, 10000)
    if (!isNaN(width)) onEditLayer({ group: g, layer: l, width })
  }
  function onEditHeight(e: FormInputEvent) {
    const height = clamp(parseInt(e.currentTarget.value), 2, 10000)
    if (!isNaN(height)) onEditLayer({ group: g, layer: l, height })
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
      if (!isNaN(colorEnvOffset)) onEditLayer({ group: g, layer: l, colorEnvOffset })
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
  {#if layer === null}
    <span>Select a layer in the tree view.</span>
  {:else}
    <h3 class="bx--modal-header__heading">{layerName(layer)}</h3>
    {#if !isPhysicsLayer(layer)}
      <label>
        Group <input
          type="number"
          min={0}
          max={$rmap.groups.length - 1}
          value={g}
          on:change={onEditGroup}
        />
      </label>
    {/if}
    <label>
      Order <input
        type="number"
        min={0}
        max={group.layers.length - 1}
        value={l}
        on:change={onEditOrder}
      />
    </label>
    {#if layer instanceof AnyTilesLayer}
      <label>
        Width <input type="number" min={2} max={10000} value={layer.width} on:change={onEditWidth} />
      </label>
      <label>
        Height <input
          type="number"
          min={2}
          max={10000}
          value={layer.height}
          on:change={onEditHeight}
        />
      </label>
    {/if}
    {#if layer instanceof TilesLayer || layer instanceof QuadsLayer}
      <label>
        Detail <input type="checkbox" checked={layer.detail} on:change={onEditDetail} />
      </label>
      {@const img = layer.image ? layer.image.name : '<none>'}
      <label>
        Image <input type="button" value={img} on:click={() => (imagePickerOpen = true)} />
      </label>
    {/if}
    {#if layer instanceof TilesLayer}
      <label>
        Color <input type="color" value={colorToStr(layer.color)} on:change={onEditColor} />
      </label>
      <label>
        Opacity <input
          type="range"
          min={0}
          max={255}
          value={layer.color.a}
          on:change={onEditOpacity}
        />
      </label>
      <label>
        Color Envelope <select on:change={onEditColorEnv}>
          <option selected={layer.colorEnv === null} value={null}>None</option>
          {#each colorEnvelopes as env}
            {@const i = $rmap.map.envelopes.indexOf(env)}
            <option selected={layer.colorEnv === env} value={i}>
              {'#' + i + ' ' + (env.name || '(unnamed)')}
            </option>
          {/each}
        </select>
      </label>
      <label>
        Color Env. Offset <input
          type="number"
          value={layer.colorEnvOffset}
          on:change={onEditColorEnvOffset}
        />
      </label>
    {/if}
    {#if layer instanceof TilesLayer || layer instanceof QuadsLayer}
      <label>
        Name <input type="text" value={layer.name} maxlength={11} on:change={onEditName} />
      </label>
    {/if}
    {#if !(layer instanceof GameLayer)}
      <button class="danger large" on:click={onDelete}>Delete layer</button>
    {/if}
  {/if}
</div>

<ComposedModal bind:open={imagePickerOpen} size="lg">
  <ModalHeader title="Pick an image" />
  <ModalBody hasForm>
    <ImagePicker
      {images}
      {image}
      on:pick={onImagePick}
      on:cancel={() => (imagePickerOpen = false)}
      on:delete={onImageDelete}
    />
  </ModalBody>
</ComposedModal>
