<script lang="ts">
  import type { Layer } from '../../twmap/layer'
  import type { Color } from '../../twmap/types'
  import type { Envelope } from '../../twmap/map'
  import { type FormInputEvent, layerKind } from './util'
  import { TilesLayerFlags } from '../../twmap/types'
  import { AnyTilesLayer, TilesLayer, GameLayer } from '../../twmap/tilesLayer'
  import { QuadsLayer } from '../../twmap/quadsLayer'
  import { showInfo, showError, clearDialog } from '../lib/dialog'
  import { server, automappers } from '../global'
  import { externalImageUrl, isPhysicsLayer } from './util'
  import { Image } from '../../twmap/image'
  import { ColorEnvelope } from '../../twmap/envelope'
  import ImagePicker from './imagePicker.svelte'
  import AutomapperPicker from './automapper.svelte'
  // import { automap, parse, type Config as AutomapperConfig } from '../../twmap/automap'
  import { ComposedModal, ModalBody, ModalHeader } from 'carbon-components-svelte'
  import { rmap } from '../global'
  import { bytesToBase64, dataToTiles, resIndexToString, stringToResIndex, tilesLayerFlagsToLayerKind } from '../../server/convert'
  import { pick, read, sync, _ } from '../../server/util'
  import type { Readable, Writable } from 'svelte/store'
  import type * as Info from '../../twmap/types'
  import Number from './number.svelte'

  export let g: number, l: number

  $: rgroup = g === -1 ? null : $rmap.groups[g]
  $: rlayer = l === -1 ? null : rgroup.layers[l]
  $: group = rgroup === null ? null : rgroup.group
  $: layer = rlayer === null ? null : rlayer.layer as TilesLayer | QuadsLayer

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

  function layerName(layer: Layer, name: string) {
    const quotedName = name ? " '" + name + "'" : ''
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

  function amCfgName(img: string, cfg: number): string {
    return $automappers[img + '.rules']?.configs?.at(cfg) ?? 'None'
  }

  let imagePickerOpen = false
  let automapperOpen = false

  async function onImagePick(e: Event & { detail: File | Image | string | null }) {
    if (!layer)
      return
    imagePickerOpen = false

    // no image used
    if (e.detail === null) {
      await $server.query('map/edit/layer', [g, l, { type: layerKind(layer), image: null }])
    }
    // use existing image
    else if (e.detail instanceof Image) {
      const index = $rmap.map.images.indexOf(e.detail)
      await $server.query('map/edit/layer', [g, l, { type: layerKind(layer), image: resIndexToString(index, e.detail.name) }])
    }
    // new uploaded image
    else if (e.detail instanceof File) {
      const name = e.detail.name.replace(/\.[^\.]+$/, '')
      uploadImageAndPick(e.detail, name)
    }
    // new image from gallery
    else {
      const name = e.detail
      const url = externalImageUrl(e.detail)
      const embed = await showInfo('Do you wish to embed this image?', 'yesno')
      if (embed) {
        const resp = await fetch(url)
        const file = await resp.blob()
        const name = e.detail
        uploadImageAndPick(file, name)
      }
      else {
        try {
          showInfo('Creating image...', 'none')
          await $server.query('map/create/image', [name, { size: { w: 1024, h: 1024 } }])
          const index = $rmap.map.images.length - 1
          await $server.query('map/edit/layer', [g, l, { type: layerKind(layer), image: resIndexToString(index, name) }])
          clearDialog()
        } catch (e) {
          showError('Failed to create external image: ' + e)
        }
      }
    }
  }

  async function uploadImageAndPick(file: Blob, name: string) {
    if (!layer)
      return
    try {
      // await uploadImage($serverConfig.httpUrl, $rmap.map.name, name, file) // TODO return index
      const buf = new Uint8Array(await file.arrayBuffer())
      await $server.query('map/create/image', [name, bytesToBase64(buf)])
      const index = $rmap.map.images.length - 1
      await $server.query('map/edit/layer', [g, l, { type: layerKind(layer), image: resIndexToString(index, name) }])
    } catch (e) {
      showError('Failed to upload image: ' + e)
    }
  }

  async function onImageDelete(e: Event & { detail: Image }) {
    const image = e.detail
    if ($rmap.map.imageInUse(image)) {
      showError('Cannot delete image in use')
      return
    }

    const index = $rmap.map.images.indexOf(image)
    await $server.query('map/delete/image', index)
  }

  let syncName: Writable<string>
  let syncDetail: Writable<boolean>
  let syncWidth: Writable<number>
  let syncHeight: Writable<number>
  let syncColor: Writable<Info.Color>
  let syncColorEnv: Writable<number>
  let syncColorEnvOff: Writable<number>
  let syncImgs: Readable<Image[]>
  let syncImg: Readable<Image | null>
  let syncAmCfg: Readable<number | null>
  let syncColEnvs: Readable<Envelope[]>

  $: syncGroup = sync($server, g, {
    query: 'map/move/layer',
    match: [[g, l], [pick, _]],
    send: s => [[g, l], [s, 0]],
  })
  $: syncOrder = sync($server, l, {
    query: 'map/move/layer',
    match: [[g, l], [_, pick]],
    send: s => [[g, l], [g, s]],
  })
  $: if (layer) {
    syncName = sync($server, layer.name, {
      query: 'map/edit/layer',
      match: [g, l, { name: pick }],
      send: s => [g, l, { type: layerKind(layer), name: s }],
    })
  }
  $: if (layer) {
    syncDetail = sync($server, layer.detail, {
      query: 'map/edit/layer',
      match: [g, l, { detail: pick }],
      send: s => [g, l, { type: layerKind(layer), detail: s }],
    })
  }
  $: if (layer && layer instanceof AnyTilesLayer) {
    syncWidth = sync($server, layer.width, {
      query: 'map/edit/layer',
      match: [g, l, { width: pick }],
      send: s => [g, l, { type: layerKind(layer), width: s }],
    })
  }
  $: if (layer && layer instanceof AnyTilesLayer) {
    syncHeight = sync($server, layer.height, {
      query: 'map/edit/layer',
      match: [g, l, { height: pick }],
      send: s => [g, l, { type: layerKind(layer), height: s }],
    })
  }
  $: if (layer && layer instanceof AnyTilesLayer) {
    syncColor = sync($server, layer.color, {
      query: 'map/edit/layer',
      match: [g, l, { color: pick }],
      send: s => [g, l, { type: layerKind(layer), color: s }],
    })
  }
  $: if (layer && layer instanceof AnyTilesLayer) {
    syncColorEnv = sync($server, $rmap.map.envelopes.indexOf(layer.colorEnv), {
      query: 'map/edit/layer',
      match: [g, l, { color_env: pick }],
      apply: s => s === null ? -1 : stringToResIndex(s)[0],
      send: s => [g, l, { type: layerKind(layer), color_env: s === -1 ? null : resIndexToString(s) }],
    })
  }
  $: if (layer && layer instanceof AnyTilesLayer) {
    syncColorEnvOff = sync($server, layer.colorEnvOffset, {
      query: 'map/edit/layer',
      match: [g, l, { color_env_offset: pick }],
      send: s => [g, l, { type: layerKind(layer), color_env_offset: s }],
    })
  }
  $: if (layer && layer instanceof TilesLayer || layer instanceof QuadsLayer) {
    syncImg = read($server, layer.image, {
      query: 'map/edit/layer',
      match: [g, l, { image: pick }],
      apply: () => layer.image,
    })
  }
  $: syncImgs = read($server, $rmap.map.images, [{
    query: 'map/create/image',
    match: pick,
    apply: () => $rmap.map.images,
  }, {
    query: 'map/delete/image',
    match: pick,
    apply: () => $rmap.map.images,
  }])
  $: if (layer && layer instanceof TilesLayer) {
    syncAmCfg = read($server, layer.automapper.config, {
      query: 'map/edit/layer',
      match: [g, l, { automapper_config: { config: pick } }],
    })
  }
  $: if (layer && layer instanceof TilesLayer) {
    syncColEnvs = read($server, $rmap.map.envelopes.filter(e => e instanceof ColorEnvelope), [{
    query: 'map/create/envelope',
    match: pick,
    apply: () => $rmap.map.envelopes.filter(e => e instanceof ColorEnvelope),
  }, {
    query: 'map/delete/envelope',
    match: pick,
    apply: () => $rmap.map.envelopes.filter(e => e instanceof ColorEnvelope),
  }, {
    query: 'map/edit/envelope',
    match: pick,
    apply: () => $rmap.map.envelopes.filter(e => e instanceof ColorEnvelope),
  }])
  }

  function onEditColor(e: FormInputEvent) {
    $syncColor = strToColor(e.currentTarget.value, $syncColor.a)
  }
  function onEditOpacity(e: FormInputEvent) {
    $syncColor = { ...$syncColor, a: clamp(parseInt(e.currentTarget.value), 0, 255) }
  }
  function onDelete() {
    $server.query('map/delete/layer', [g, l])
  }
  async function onAutomap() {
    // TODO: move this, merge with event received from server
    await $server.query('map/edit/automap', [g, l])
    const tlayer = layer as TilesLayer
    const data = await $server.query('map/get/tiles', [g, l])
    const tiles = dataToTiles(data, tilesLayerFlagsToLayerKind(tlayer.flags))

    for (let i = 0; i < tiles.length; ++i) {
      const tile = tiles[i]
      const x = i % tlayer.width
      const y = Math.floor(i / tlayer.width)

      $rmap.editTile({ g, l, x, y, ...tile }) }

    // client-side automapping
    // setTimeout(async () => {
    //   const txt = await $server.query('sendautomapper', tlayer.image.name)
    //   const am = parse(txt)
    //   const conf = am[tlayer.automapper.config]
    //   $rmap.automapLayer(g, l, conf, tlayer.automapper.seed)
    // }, 5000)
  }
  async function onAutomapperChange() {
    if (!layer) return
    const automapper = (layer as TilesLayer).automapper
    await $server.query('map/edit/layer', [g, l, {
      type: layerKind(layer),
      automapper_config: {
        config: automapper.config === -1 ? null : automapper.config,
        seed: automapper.seed,
        automatic: automapper.automatic,
      }
    }])
  }
</script>

<div class="edit-layer">
  {#if layer === null}
    <span>Select a layer in the tree view.</span>
  {:else}
    <h3 class="bx--modal-header__heading">{layerName(layer, $syncName)}</h3>
    {#if !isPhysicsLayer(layer)}
      <Number label="Group" integer min={0} max={$rmap.groups.length - 1} bind:value={$syncGroup} />
    {/if}
    <Number label="Order" integer min={0} max={group.layers.length - 1} bind:value={$syncOrder} />
    {#if layer instanceof AnyTilesLayer}
      <Number label="Width" integer min={2} max={10000} bind:value={$syncWidth} />
      <Number label="Height" integer min={2} max={10000} bind:value={$syncHeight} />
    {/if}
    {#if layer instanceof TilesLayer || layer instanceof QuadsLayer}
      <label>
        <span>Detail</span>
        <input type="checkbox" bind:checked={$syncDetail} />
      </label>
      <label>
        <span>Image</span>
        <input type="button" value={$syncImg?.name ?? '(none)'} on:click={() => (imagePickerOpen = true)} />
      </label>
    {/if}
    {#if layer instanceof TilesLayer}
      <label>
        <span>Color</span>
        <input type="color" value={colorToStr($syncColor)} on:change={onEditColor} />
      </label>
      <label>
        <span>Opacity</span>
        <input type="range" min={0} max={255} value={layer.color.a} on:change={onEditOpacity} />
      </label>
      <label>
        <span>Color Envelope</span>
        <select bind:value={$syncColorEnv}>
          <option value={-1}>None</option>
          {#each $syncColEnvs as env}
            {@const i = $rmap.map.envelopes.indexOf(env)}
            <option value={i}> {'#' + i + ' ' + (env.name || '(unnamed)')} </option>
          {/each}
        </select>
      </label>
      <Number label="Color Env. Offset" integer bind:value={$syncColorEnvOff} />
      <label>
        Automapper <input type="button" value={amCfgName($syncImg?.name, $syncAmCfg)} disabled={layer.image === null} on:click={() => automapperOpen = true} />
      </label>
      <ComposedModal bind:open={automapperOpen} size="sm" selectorPrimaryFocus=".bx--modal-close">
        <ModalHeader title="Automapper" />
        <ModalBody hasForm>
          <AutomapperPicker
            {layer}
            on:change={onAutomapperChange}
          />
        </ModalBody>
      </ComposedModal>
      <button class="default" disabled={$syncAmCfg === null} on:click={onAutomap}>Apply Automapper</button>
    {/if}
    {#if layer instanceof TilesLayer || layer instanceof QuadsLayer}
      <label>
        <span>Name</span>
        <input type="text" value={$syncName} maxlength={11} on:change={e => $syncName = e.currentTarget.value} />
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
      images={$syncImgs}
      image={$syncImg}
      on:pick={onImagePick}
      on:cancel={() => (imagePickerOpen = false)}
      on:delete={onImageDelete}
    />
  </ModalBody>
</ComposedModal>

