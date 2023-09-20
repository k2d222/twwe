<script lang="ts">
  import type { Layer } from '../../twmap/layer'
  import type { Color } from '../../twmap/types'
  import { type FormEvent, type FormInputEvent, uploadImage } from './util'
  import { TilesLayerFlags, LayerFlags } from '../../twmap/types'
  import { AnyTilesLayer, TilesLayer, GameLayer } from '../../twmap/tilesLayer'
  import { QuadsLayer } from '../../twmap/quadsLayer'
  import { showInfo, showError, clearDialog } from '../lib/dialog'
  import { server, serverConfig, selected, automappers } from '../global'
  import { decodePng, externalImageUrl, isPhysicsLayer } from './util'
  import { Image } from '../../twmap/image'
  import { ColorEnvelope } from '../../twmap/envelope'
  import ImagePicker from './imagePicker.svelte'
  import AutomapperPicker from './automapper.svelte'
  // import { automap, parse, type Config as AutomapperConfig } from '../../twmap/automap'
  import { ComposedModal, ModalBody, ModalHeader } from 'carbon-components-svelte'
  import { rmap } from '../global'
  import { dataToTiles, resIndexToString, stringToResIndex, tilesLayerFlagsToLayerKind } from '../../server/convert'
  import { sync } from '../../server/util'
  import type { Writable } from 'svelte/store'
  import type * as Info from '../../twmap/types'
  import Number from './number.svelte'

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

  function automapperConfig(layer: TilesLayer): string | null {
    // if (
    //   layer.automapper.config === -1 ||
    //   !layer.image ||
    //   !(layer.image.name + '.rules' in $automappers) ||
    //   layer.automapper.config >= $automappers[layer.image.name + '.rules'].configs.length
    // ) {
    //   return null
    // }

    // return $automappers[layer.image.name + '.rules'][layer.automapper.config]
    // TODO
    return '??'
  }

  let imagePickerOpen = false
  let automapperOpen = false

  async function onImagePick(e: Event & { detail: File | Image | string | null }) {
    imagePickerOpen = false

    if (e.detail === null) {
      // no image used
      await $server.query('map/post/layer', [g, l, { image: null }])
    } else if (e.detail instanceof Image) {
      // use embedded image
      const index = $rmap.map.images.indexOf(e.detail)
      await $server.query('map/post/layer', [g, l, { image: resIndexToString(index, e.detail.name) }])
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
          await $server.query('map/put/image', [name, { size: { w: 1024, h: 1024 } }])
          const img = new Image()
          img.loadExternal(url)
          img.name = name
          $rmap.addImage(img)
          await $server.query('map/post/layer', [g, l, { image: resIndexToString(index, name) }])
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
      const data = await decodePng(file)
      const img = new Image()
      img.loadEmbedded(data)
      img.name = name
      $rmap.addImage(img)
      await uploadImage($serverConfig.httpUrl, $rmap.map.name, name, file) // TODO return index
      const index = $rmap.map.images.length
      await $server.query('map/post/layer', [g, l, { image: resIndexToString(index, name) }])
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
      await $server.query('map/delete/image', index)
      $rmap.removeImage(index)
      images = images // update the component
    } catch (e) {
      showError('Failed to delete image: ' + e)
    }
  }

  let syncName: Writable<string>
  let syncDetail: Writable<boolean>
  let syncWidth: Writable<number>
  let syncHeight: Writable<number>
  let syncColor: Writable<Info.Color>
  let syncColorEnv: Writable<number>
  let syncColorEnvOff: Writable<number>

  $: syncGroup = sync(g, {
    server: $server,
    query: 'map/patch/layer',
    send: s => [[g, l], [s, 0]],
    recv: ([[g1, l1], [g2, _]]) => g1 === g && l1 === l ? g2 : null, //  COMBAK: race condition with g/l?
  })
  $: syncOrder = sync(l, {
    server: $server,
    query: 'map/patch/layer',
    send: s => [[g, l], [g, s]],
    recv: ([[g1, l1], [_, l2]]) => g1 === g && l1 === l ? l2 : null,
  })
  $: if (layer) {
    syncName = sync(layer.name, {
      server: $server,
      query: 'map/post/layer',
      send: s => [g, l, { name: s, }],
      recv: ([eg, el, e]) => eg === g && el === l && 'name' in e ? e.name : null,
    })
  }
  $: if (layer) {
    syncDetail = sync(layer.detail, {
      server: $server,
      query: 'map/post/layer',
      send: s => [g, l, { detail: s }],
      recv: ([eg, el, e]) => eg === g && el === l && 'detail' in e ? e.detail : null,
    })
  }
  $: if (layer && layer instanceof AnyTilesLayer) {
    syncWidth = sync(layer.width, {
      server: $server,
      query: 'map/post/layer',
      send: s => [g, l, { width: s }],
      recv: ([eg, el, e]) => eg === g && el === l && 'width' in e ? e.width : null,
    })
  }
  $: if (layer && layer instanceof AnyTilesLayer) {
    syncHeight = sync(layer.height, {
      server: $server,
      query: 'map/post/layer',
      send: s => [g, l, { height: s }],
      recv: ([eg, el, e]) => eg === g && el === l && 'height' in e ? e.height : null,
    })
  }
  $: if (layer && layer instanceof AnyTilesLayer) {
    syncColor = sync(layer.color, {
      server: $server,
      query: 'map/post/layer',
      send: s => [g, l, { color: s }],
      recv: ([eg, el, e]) => eg === g && el === l && 'color' in e ? e.color : null,
    })
  }
  $: if (layer && layer instanceof AnyTilesLayer) {
    syncColorEnv = sync($rmap.map.envelopes.indexOf(layer.colorEnv), {
      server: $server,
      query: 'map/post/layer',
      send: s => [g, l, { color_env: s === -1 ? null : resIndexToString(s, $rmap.map.envelopes[s].name) }],
      recv: ([eg, el, e]) => eg === g && el === l && 'color_env' in e ? e.color_env === null ? -1 : stringToResIndex(e.color_env)[0] : null,
    })
  }
  $: if (layer && layer instanceof AnyTilesLayer) {
    syncColorEnvOff = sync(layer.colorEnvOffset, {
      server: $server,
      query: 'map/post/layer',
      send: s => [g, l, { color_env_offset: s }],
      recv: ([eg, el, e]) => eg === g && el === l && 'color_env_offset' in e ? e.color_env_offset : null,
    })
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
    await $server.query('map/post/automap', [g, l])
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
    const automapper = (layer as TilesLayer).automapper
    await $server.query('map/post/layer', [g, l, {
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
      {@const img = layer.image ? layer.image.name : '<none>'}
      <label>
        <span>Image</span>
        <input type="button" value={img} on:click={() => (imagePickerOpen = true)} />
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
          {#each colorEnvelopes as env}
            {@const i = $rmap.map.envelopes.indexOf(env)}
            <option value={i}> {'#' + i + ' ' + (env.name || '(unnamed)')} </option>
          {/each}
        </select>
      </label>
      <Number label="Color Env. Offset" integer bind:value={$syncColorEnvOff} />
      {@const conf = automapperConfig(layer)}
      <label>
        Automapper <input type="button" value={conf ?? 'None'} disabled={layer.image === null} on:click={() => automapperOpen = true} />
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
      <button class="default" disabled={conf === null} on:click={onAutomap}>Apply Automapper</button>
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
      {images}
      {image}
      on:pick={onImagePick}
      on:cancel={() => (imagePickerOpen = false)}
      on:delete={onImageDelete}
    />
  </ModalBody>
</ComposedModal>

