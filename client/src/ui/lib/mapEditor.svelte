
<script lang="ts">
  import * as Editor from './editor'
  import { server, selected, anim, peers, rmap, map, serverConfig } from '../global'
  import { AnyTilesLayer, GameLayer } from "../../twmap/tilesLayer"
  import { tweened } from "svelte/motion"
  import { type Coord, LayerType } from "../../twmap/types"
  import { QuadsLayer } from "../../twmap/quadsLayer"
  import { Image } from '../../twmap/image'
  import QuadsView from "./quadsView.svelte"
  import { onDestroy, onMount } from "svelte"
  import { RenderQuadsLayer } from "../../gl/renderQuadsLayer"
  import TilePicker from './tilePicker.svelte'
  import BrushEditor from './editBrush.svelte'
  import Stats from './stats.svelte'
  import { RenderAnyTilesLayer } from "../../gl/renderTilesLayer"
  import { viewport, renderer } from '../../gl/global'
  import { decodePng, externalImageUrl, queryImageData } from './util'
  import MapView from './mapView.svelte'
  import type { RenderGroup } from '../../gl/renderGroup'
  import type { RenderLayer } from '../../gl/renderLayer'
  import type * as MapDir from '../../twmap/mapdir'
  import type * as Info from '../../twmap/types'
  import type { Cursors, MapCreateReq, Recv, Resp } from '../../server/protocol'
  import { base64ToBytes } from '../../server/convert'

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

  let mapView: MapView

  // computed (read-only)
  let rgroup: RenderGroup | null = null
  let rlayer: RenderLayer | null = null
  let selectedTileLayers: number[] = []
  $: if ($rmap) {
    rgroup = g === -1 ? null : $rmap.groups[g]
    rlayer = l === -1 ? null : rgroup.layers[l]
    selectedTileLayers = $selected
      .map(([_, l]) => l)
      .filter(l => l !== -1 && $rmap.map.groups[g].layers[l].type === LayerType.TILES)

    $rmap.setActiveLayer(rlayer)
  }

  let time = 0
  let animTime = 0
  $: if (!$anim && $rmap) updateEnvelopes(0)

  // brush styling
  let brushOutlineStyle = ''
  let layerOutlineStyle = ''
  let clipOutlineStyle = ''

  // cursors
  let cursorInterval = 0
  let cursorDuration = 300
  let cursors: { [k: string]: { x: number, y: number } } = {}
  let cursorAnim = tweened(cursors, { duration: cursorDuration })
  $: if ($peers === 1) {
    cursors = {}
    cursorAnim = tweened(cursors, { duration: cursorDuration })
  }

  // imput state
  let shiftKey = false
  $: if (shiftKey && brushState === BrushState.Select) brushState = BrushState.Erase
  $: if (!shiftKey && brushState === BrushState.Erase) brushState = BrushState.Select

  // brush settings
  enum BrushState {
    Empty,
    Select,
    Fill,
    Erase,
    Paste,
  }
  let brushState = BrushState.Empty
  let mouseRange = Editor.createRange() // start and end pos of visible brush outline
  let brushRange = Editor.createRange() // start and end pos of copied buffer (if any)
  let brushBuffer: Editor.Brush | null = null
  $: onLayerSelectionChanged($selected)
  $: if($rmap) $rmap.setBrush(brushBuffer)
  $: if($rmap) $rmap.moveBrush(mouseRange.start)

  let destroyed = false

  function onCreateQuad([g, l, part]: Recv['map/put/quad']) {
    $rmap.createQuad(g, l, part)
  }
  function onEditQuad([g, l, q, part]: Recv['map/post/quad']) {
    $rmap.editQuad(g, l, q, part)
  }
  function onDeleteQuad([g, l, q]: Recv['map/delete/quad']) {
    $rmap.deleteQuad(g, l, q)
  }
  function onCreateEnvelope(part: Recv['map/put/envelope']) {
    $rmap.createEnvelope(part)
  }
  function onEditEnvelope([e, part]: Recv['map/post/envelope']) {
    $rmap.editEnvelope(e, part)
  }
  function onDeleteEnvelope(e: Recv['map/delete/envelope']) {
    $rmap.removeEnvelope(e)
  }
  function onCreateGroup(part: Recv['map/put/group']) {
    $rmap.createGroup(part)
  }
  function onEditGroup([g, part]: Recv['map/post/group']) {
    $rmap.editGroup(g, part)
  }
  function onDeleteGroup(dg: Recv['map/delete/group']) {
    $rmap.deleteGroup(dg)
    $selected = $selected
      .filter(([g, _]) => g !== dg)
      .map(([g, l]) => g > dg ? [g -1, l] : [g, l])
  }
  function onReorderGroup([src, tgt]: Recv['map/patch/group']) {
    $rmap.reorderGroup(src, tgt)
    $selected.pop() // remove active
    const active: [number, number] =
       rlayer ? $rmap.map.layerIndex(rlayer.layer) :
       rgroup ? [$rmap.map.groupIndex(rgroup.group), -1] :
       $rmap.map.physicsLayerIndex(GameLayer)
    $selected = [...$selected, active]
  }
  function onCreateLayer([g, part]: Recv['map/put/layer']) {
    $rmap.createLayer(g, part)
  }
  async function onEditLayer([g, l, part]: Recv['map/post/layer']) {
    $rmap.editLayer(g, l, part)
  }
  function onDeleteLayer([dg, dl]: Recv['map/delete/layer']) {
    $rmap.deleteLayer(dg, dl)
    $selected = $selected.filter(([g, l]) => g !== dg || l !== dl)
    if ($selected.length === 0) {
      $selected = (rgroup.layers.length === 0) ?
        [$rmap.map.physicsLayerIndex(GameLayer)] :
        [[g, Math.min(rgroup.layers.length - 1, dl)]]
    }
  }
  function onReorderLayer([src, tgt]: Recv['map/patch/layer']) {
    $rmap.reorderLayer(src, tgt)
    $selected.pop() // remove active
    const active: [number, number] =
       rlayer ? $rmap.map.layerIndex(rlayer.layer) :
       rgroup ? [$rmap.map.groupIndex(rgroup.group), -1] :
       $rmap.map.physicsLayerIndex(GameLayer)
    $selected = [...$selected, active]
  }
  async function onCreateImage([name, img]: Recv['map/put/image']) {
    if (typeof img === 'object') { // external image
      const image = new Image()
      image.loadExternal(externalImageUrl(name))
      image.name = name
      $rmap.addImage(image)
    } else { // embedded image
      const image = new Image()
      image.name = name
      $rmap.addImage(image)
      const bytes = base64ToBytes(img)
      const png = await decodePng(new Blob([bytes]))
      image.loadEmbedded(png)
    }
  }
  function onDeleteImage(e: Recv['map/delete/image']) {
    $rmap.removeImage(e)
  }
  async function onEditInfo(part: Partial<MapDir.Info>) {
    for (const k in part) {
      $rmap.map.info[k] = part[k]
    }
  }

  onMount(() => {
    $rmap = mapView.getRenderMap()
  
    // these event hooks have priority because they manage the state of the map.
    $server.on('map/put/quad', onCreateQuad, true)
    $server.on('map/post/quad', onEditQuad, true)
    $server.on('map/delete/quad', onDeleteQuad, true)
    $server.on('map/put/envelope', onCreateEnvelope, true)
    $server.on('map/post/envelope', onEditEnvelope, true)
    $server.on('map/delete/envelope', onDeleteEnvelope, true)
    $server.on('map/post/layer', onEditLayer, true)
    $server.on('map/post/group', onEditGroup, true)
    $server.on('map/put/group', onCreateGroup, true)
    $server.on('map/put/layer', onCreateLayer, true)
    $server.on('map/patch/group', onReorderGroup, true)
    $server.on('map/patch/layer', onReorderLayer, true)
    $server.on('map/delete/group', onDeleteGroup, true)
    $server.on('map/delete/layer', onDeleteLayer, true)
    $server.on('map/put/image', onCreateImage, true)
    $server.on('map/delete/image', onDeleteImage, true)
    $server.on('map/post/info', onEditInfo, true)

    // cursorInterval = setInterval(updateCursors, cursorDuration) as any

    renderLoop(0)
  })

  onDestroy(() => {
    destroyed = true
    $server.off('map/put/quad', onCreateQuad)
    $server.off('map/post/quad', onEditQuad)
    $server.off('map/delete/quad', onDeleteQuad)
    $server.off('map/put/envelope', onCreateEnvelope)
    $server.off('map/post/envelope', onEditEnvelope)
    $server.off('map/delete/envelope', onDeleteEnvelope)
    $server.off('map/post/layer', onEditLayer)
    $server.off('map/post/group', onEditGroup)
    $server.off('map/put/group', onCreateGroup)
    $server.off('map/put/layer', onCreateLayer)
    $server.off('map/patch/group', onReorderGroup)
    $server.off('map/patch/layer', onReorderLayer)
    $server.off('map/delete/group', onDeleteGroup)
    $server.off('map/delete/layer', onDeleteLayer)
    $server.off('map/put/image', onCreateImage)
    $server.off('map/delete/image', onDeleteImage)
    $server.off('map/post/info', onEditInfo)

    clearInterval(cursorInterval)
  })

  function renderLoop(t: DOMHighResTimeStamp) {
    if (destroyed)
      return

    if ($anim) {
      animTime += t - time
      updateEnvelopes(animTime)
    }

    renderer.render(viewport, $rmap)
    updateOutlines()
    cursorAnim = cursorAnim // redraw cursors

    time = t

    requestAnimationFrame(renderLoop)
  }

  function onCursors(e: Resp['map/get/cursors']) {
    cursors = Object.fromEntries(Object.entries(e).map(([k, v]) => {
      if (0 <= v.g && v.g < $rmap.groups.length) {
        const rgroup = $rmap.groups[v.g]
        let [ offX, offY ] = rgroup.offset()
        // const [ x, y ] = viewport.worldToCanvas(v.point.x + offX, v.point.y + offY)
        return [k, { x: v.x + offX, y: v.y + offY }]
      }
      else {
        // const [ x, y ] = viewport.worldToCanvas(v.point.x, v.point.y)
        return [k, [v.x, v.y]]
      }

    }))

    const k1 = Object.keys($cursorAnim).sort()
    const k2 = Object.keys(cursors).sort()
    const eq = k1.length === k2.length && k1.every((k, i) => k === k2[i])

    if (!eq) {
      cursorAnim = tweened(cursors, { duration: cursorDuration })
    }
    else {
      cursorAnim.set(cursors)
    }
  }

  function worldPosToTileCoord(pos: Coord): Coord {
    const [offX, offY] = rgroup.offset()
    return {
      x: Math.floor(pos.x - offX),
      y: Math.floor(pos.y - offY),
    }
  }

  function updateMouseRange() {
    const curPos = worldPosToTileCoord(viewport.mousePos)

    if (brushState === BrushState.Paste) {
      mouseRange.start = curPos
      mouseRange.end.x = curPos.x + (brushRange.end.x - brushRange.start.x)
      mouseRange.end.y = curPos.y + (brushRange.end.y - brushRange.start.y)
    } else {
      mouseRange.end = curPos
    }
  }

  function onMouseDown(e: MouseEvent) {
    if (e.target !== viewport.canvas)
      return

    if (rlayer && rlayer.layer instanceof AnyTilesLayer || $selected.length > 1) {
      updateMouseRange()

      if (e.buttons === 1 && !e.ctrlKey) {
        // left click
        if (brushState === BrushState.Empty) {
          // start a selection
          mouseRange.start = mouseRange.end
          brushRange.start = mouseRange.end
          brushState = e.shiftKey ? BrushState.Erase : BrushState.Select
        } else if (brushState === BrushState.Paste && !e.ctrlKey && !e.shiftKey) {
          // paste current selection
          Editor.placeTiles($server, $rmap, mouseRange.start, brushBuffer)
        } else if (brushState === BrushState.Paste && e.shiftKey) {
          // start a fill selection
          brushState = BrushState.Fill
        }
      }
    }
  }

  function onMouseMove(e: MouseEvent) {
    shiftKey = e.shiftKey
    if (rlayer && rlayer.layer instanceof AnyTilesLayer || $selected.length > 1) {
      const curPos = worldPosToTileCoord(viewport.mousePos)

      if (e.buttons === 1) {
        // left click
        if (brushState === BrushState.Paste) {
          Editor.drawLine($server, $rmap, mouseRange.start, curPos, brushBuffer)
        }
      }

      updateMouseRange()
    }
  }

  function onMouseUp(_e: MouseEvent) {
    if (selectedTileLayers.length > 0) {
      updateMouseRange()

      if (brushState === BrushState.Select) {
        // end selection
        brushRange.end = mouseRange.end
        brushRange = Editor.normalizeRange(brushRange)
        brushBuffer = Editor.makeBoxSelection($rmap.map, g, selectedTileLayers, brushRange)
        brushState = BrushState.Paste
        updateMouseRange()
      } else if (brushState === BrushState.Fill) {
        // fill selection with brush buffer
        Editor.fill($server, $rmap, Editor.normalizeRange(mouseRange), brushBuffer)
        brushState = BrushState.Paste
      } else if (brushState === BrushState.Erase) {
        // erase selection
        const range = Editor.normalizeRange(mouseRange)
        const buffer = Editor.makeEmptySelection($rmap.map, g, selectedTileLayers, range)
        Editor.fill($server, $rmap, range, buffer)
        brushState = brushBuffer === null ? BrushState.Empty : BrushState.Paste
      }
    }
  }

  function onContextMenu(e: MouseEvent) {
    e.preventDefault()
    brushState = BrushState.Empty
    brushBuffer = null
  }

  function updateClipOutline() {
    if (rgroup && rgroup.group.clipping) {
      const { scale, pos } = viewport
      let { clipX, clipY, clipW, clipH } = rgroup.group
      clipX /= 32
      clipY /= 32
      clipW /= 32
      clipH /= 32
      clipOutlineStyle = `
        width: ${clipW * scale}px;
        height: ${clipH * scale}px;
        top: ${(clipY - pos.y) * scale}px;
        left: ${(clipX - pos.x) * scale}px;
      `
    } else {
      clipOutlineStyle = `
        display: none;
      `
    }
  }

  function updateLayerOutline() {
    if (rlayer && rlayer.layer instanceof AnyTilesLayer) {
      const { scale, pos } = viewport
      const [offX, offY] = rgroup.offset()
      layerOutlineStyle = `
        width: ${rlayer.layer.width * scale}px;
        height: ${rlayer.layer.height * scale}px;
        top: ${(-pos.y + offY) * scale}px;
        left: ${-(pos.x - offX) * scale}px;
      `
    } else {
      layerOutlineStyle = `
        display: none;
      `
    }
  }

  function updateBrushOutline() {
    if (rlayer && rlayer.layer instanceof AnyTilesLayer && brushState !== BrushState.Empty) {
      const fillColor =
        brushState === BrushState.Fill
          ? 'orange'
          : brushState === BrushState.Erase
          ? 'red'
          : brushState === BrushState.Select
          ? 'blue'
          : 'white'

      const range = Editor.normalizeRange(mouseRange)
      const [x, y] = viewport.worldToPixel(range.start.x, range.start.y)
      const [offX, offY] = rgroup.offset()
      const w = (range.end.x - range.start.x + 1) * viewport.scale
      const h = (range.end.y - range.start.y + 1) * viewport.scale

      const brushValid =
        range.start.x >= 0 &&
        range.start.y >= 0 &&
        range.end.x < rlayer.layer.width &&
        range.end.y < rlayer.layer.height

      const strokeColor = brushValid ? 'black' : 'red'

      brushOutlineStyle = `
          width: ${w}px;
          height: ${h}px;
          top: ${y + offY * viewport.scale}px;
          left: ${x + offX * viewport.scale}px;
          background: ${fillColor};
          border-width: ${viewport.scale / 16}px;
          border-color: ${strokeColor};
        `
    } else {
      brushOutlineStyle = `
        display: none;
      `
    }
  }

  function updateOutlines() {
    updateClipOutline()
    updateLayerOutline()
    updateBrushOutline()
  }

  async function updateCursors() {
    if ($peers < 2 || rgroup === null)
      return

    let [ offX, offY ] = rgroup.offset()
    await $server.query('map/cursor', {
      g,
      l,
      x: viewport.mousePos.x - offX,
      y: viewport.mousePos.y - offY,
    })
    const cursors = await $server.query('map/get/cursors', undefined)
    onCursors(cursors)
  }

  function updateEnvelopes(t: number) {
    for (let env of $rmap.map.envelopes) {
      env.update(t)
    }
    for (const rgroup of $rmap.groups) {
      for (const rlayer of rgroup.layers) {
        if (rlayer instanceof RenderQuadsLayer) {
          rlayer.recomputeEnvelope() // COMBAK: maybe better perfs?
        }
      }
    }
  }

  function onTilePick(e: CustomEvent<Info.Tile[][]>) {
    brushBuffer = {
      group: g,
      layers: [{
        layer: l,
        tiles: e.detail,
      }]
    }
    brushBuffer = Editor.adaptBrushToLayers($rmap.map, brushBuffer, $selected.map(s => s[1]))

    if (brushBuffer === null) {
      brushState = BrushState.Empty
    } else {
      brushState = BrushState.Paste
      brushRange = {
        start: { x: 0, y: 0 },
        end: { x: e.detail[0].length - 1, y: e.detail.length - 1 },
      }
      mouseRange.end.x = mouseRange.start.x + brushRange.end.x
      mouseRange.end.y = mouseRange.start.y + brushRange.end.y
    }
  }

  function onBrushChange(e: CustomEvent<Editor.Brush>) {
    brushBuffer = e.detail
    const tiles = brushBuffer.layers[0].tiles

    brushRange = {
      start: { x: 0, y: 0 },
      end: { x: tiles[0].length - 1, y: tiles.length - 1 },
    }
    mouseRange.end.x = mouseRange.start.x + brushRange.end.x
    mouseRange.end.y = mouseRange.start.y + brushRange.end.y
  }

  function onLayerSelectionChanged(sel: [number, number][]) {
    if (!brushBuffer) {
      return
    }

    if (sel.length === 0) {
      brushBuffer = null
      return
    }

    const g = sel[0][0]
    if (g !== brushBuffer.group) {
      brushBuffer = null
      return
    }

    brushBuffer = Editor.adaptBrushToLayers($rmap.map, brushBuffer, sel.map(s => s[1]))
  }
</script>


<!-- svelte-ignore a11y-no-static-element-interactions -->
<div id="map-editor"
  on:mousedown={onMouseDown}
  on:mouseup={onMouseUp}
  on:mousemove={onMouseMove}
  on:contextmenu={onContextMenu}
>
  <MapView map={$map} bind:this={mapView}>

    <div id="clip-outline" style={clipOutlineStyle} />
    <div id="brush-outline" style={brushOutlineStyle} />
    <div id="layer-outline" style={layerOutlineStyle} />

    {#if rlayer && rlayer.layer instanceof QuadsLayer}
      <QuadsView layer={rlayer.layer} />
    {/if}

    <div id="cursors">
      {#each Object.values($cursorAnim) as cur}
        <img class="cursor" src="/assets/gui_cursor.png" alt=""
          style:top={(cur.y - viewport.pos.y) * viewport.scale + 'px'}
          style:left={(cur.x - viewport.pos.x) * viewport.scale + 'px'}
        />
      {/each}
    </div>

  </MapView>

  {#if brushBuffer !== null}
    <BrushEditor
      brush={brushBuffer}
      on:change={onBrushChange}
    />
  {/if}

  {#if rlayer instanceof RenderAnyTilesLayer}
    <TilePicker
      rlayer={rlayer}
      on:select={onTilePick}
    />
  {/if}

</div>

{#if import.meta.env.MODE === 'development'}
  <Stats {time} />
{/if}
