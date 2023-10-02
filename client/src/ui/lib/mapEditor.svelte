
<script lang="ts">
  import * as Editor from './editor'
  import { server, selected, anim, peers, rmap, map } from '../global'
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
  import { externalImageUrl } from './util'
  import MapView from './mapView.svelte'
  import type { RenderGroup } from '../../gl/renderGroup'
  import type { RenderLayer } from '../../gl/renderLayer'
  import type * as MapDir from '../../twmap/mapdir'
  import type * as Info from '../../twmap/types'
  import type { Recv, Resp } from '../../server/protocol'
  import { base64ToBytes } from '../../server/convert'
  import { Button } from 'carbon-components-svelte'
  import { Add as AddIcon } from 'carbon-icons-svelte'

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
  let quadsView: QuadsView

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

  function onCreateQuad([g, l, part]: Recv['create/quad']) {
    $rmap.createQuad(g, l, part)
  }
  function onEditQuad([g, l, q, part]: Recv['edit/quad']) {
    $rmap.editQuad(g, l, q, part)
  }
  function onDeleteQuad([g, l, q]: Recv['delete/quad']) {
    $rmap.deleteQuad(g, l, q)
  }
  function onCreateEnvelope(part: Recv['create/envelope']) {
    $rmap.createEnvelope(part)
  }
  function onEditEnvelope([e, part]: Recv['edit/envelope']) {
    $rmap.editEnvelope(e, part)
  }
  function onDeleteEnvelope(e: Recv['delete/envelope']) {
    $rmap.removeEnvelope(e)
  }
  function onCreateGroup(part: Recv['create/group']) {
    $rmap.createGroup(part)
  }
  function onEditGroup([g, part]: Recv['edit/group']) {
    $rmap.editGroup(g, part)
  }
  function onDeleteGroup(dg: Recv['delete/group']) {
    $rmap.deleteGroup(dg)
    $selected = $selected
      .filter(([g, _]) => g !== dg)
      .map(([g, l]) => g > dg ? [g -1, l] : [g, l])
  }
  function onReorderGroup([src, tgt]: Recv['move/group']) {
    $rmap.reorderGroup(src, tgt)
    $selected.pop() // remove active
    const active: [number, number] =
       rlayer ? $rmap.map.layerIndex(rlayer.layer) :
       rgroup ? [$rmap.map.groupIndex(rgroup.group), -1] :
       $rmap.map.physicsLayerIndex(GameLayer)
    $selected = [...$selected, active]
  }
  function onCreateLayer([g, part]: Recv['create/layer']) {
    $rmap.createLayer(g, part)
  }
  async function onEditLayer([g, l, part]: Recv['edit/layer']) {
    $rmap.editLayer(g, l, part)
  }
  function onDeleteLayer([dg, dl]: Recv['delete/layer']) {
    $rmap.deleteLayer(dg, dl)
    $selected = $selected.filter(([g, l]) => g !== dg || l !== dl)
  }
  function onReorderLayer([src, tgt]: Recv['move/layer']) {
    $rmap.reorderLayer(src, tgt)
    $selected.pop() // remove active
    const active: [number, number] =
       rlayer ? $rmap.map.layerIndex(rlayer.layer) :
       rgroup ? [$rmap.map.groupIndex(rgroup.group), -1] :
       $rmap.map.physicsLayerIndex(GameLayer)
    $selected = [...$selected, active]
  }
  async function onCreateImage([name, img]: Recv['create/image']) {
    if (typeof img === 'object') { // external image
      const image = new Image()
      image.name = name
      $rmap.addImage(image)
      image.loadExternal(externalImageUrl(name))
    }
    else { // embedded image
      const image = new Image()
      image.name = name
      $rmap.addImage(image)
      const bytes = base64ToBytes(img)
      image.loadExternal(URL.createObjectURL(new Blob([bytes])))
    }
  }
  function onDeleteImage(e: Recv['delete/image']) {
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
    $server.on('create/quad', onCreateQuad, true)
    $server.on('edit/quad', onEditQuad, true)
    $server.on('delete/quad', onDeleteQuad, true)
    $server.on('create/envelope', onCreateEnvelope, true)
    $server.on('edit/envelope', onEditEnvelope, true)
    $server.on('delete/envelope', onDeleteEnvelope, true)
    $server.on('edit/layer', onEditLayer, true)
    $server.on('edit/group', onEditGroup, true)
    $server.on('create/group', onCreateGroup, true)
    $server.on('create/layer', onCreateLayer, true)
    $server.on('move/group', onReorderGroup, true)
    $server.on('move/layer', onReorderLayer, true)
    $server.on('delete/group', onDeleteGroup, true)
    $server.on('delete/layer', onDeleteLayer, true)
    $server.on('create/image', onCreateImage, true)
    $server.on('delete/image', onDeleteImage, true)
    $server.on('edit/info', onEditInfo, true)

    // do not send cursors events in development, as this spams the websocket logs a lot.
    if (import.meta.env.MODE !== 'development')
      cursorInterval = setInterval(updateCursors, cursorDuration) as any

    renderLoop(0)
  })

  onDestroy(() => {
    destroyed = true
    $server.off('create/quad', onCreateQuad)
    $server.off('edit/quad', onEditQuad)
    $server.off('delete/quad', onDeleteQuad)
    $server.off('create/envelope', onCreateEnvelope)
    $server.off('edit/envelope', onEditEnvelope)
    $server.off('delete/envelope', onDeleteEnvelope)
    $server.off('edit/layer', onEditLayer)
    $server.off('edit/group', onEditGroup)
    $server.off('create/group', onCreateGroup)
    $server.off('create/layer', onCreateLayer)
    $server.off('move/group', onReorderGroup)
    $server.off('move/layer', onReorderLayer)
    $server.off('delete/group', onDeleteGroup)
    $server.off('delete/layer', onDeleteLayer)
    $server.off('create/image', onCreateImage)
    $server.off('delete/image', onDeleteImage)
    $server.off('edit/info', onEditInfo)

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

  function onCursors(e: Resp['get/cursors']) {
    cursors = Object.fromEntries(Object.entries(e).map(([k, v]) => {
      if (0 <= v.g && v.g < $rmap.groups.length) {
        const rgroup = $rmap.groups[v.g]
        let [ offX, offY ] = rgroup.offset()
        // const [ x, y ] = viewport.worldToCanvas(v.point.x + offX, v.point.y + offY)
        return [k, { x: v.x + offX, y: v.y + offY }]
      }
      else {
        // const [ x, y ] = viewport.worldToCanvas(v.point.x, v.point.y)
        return [k, { x: v.x, y: v.y }]
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
    const [offX, offY] = rgroup?.offset() ?? [0, 0]
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
      const [offX, offY] = rgroup?.offset() ?? [0, 0]
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
      const [offX, offY] = rgroup?.offset() ?? [0, 0]
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
    await $server.query('cursor', {
      g,
      l,
      x: viewport.mousePos.x - offX,
      y: viewport.mousePos.y - offY,
    })
    const cursors = await $server.query('get/cursors', undefined)
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

  function onTilePick(e: CustomEvent<Info.AnyTile[][]>) {
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
      <QuadsView bind:this={quadsView} layer={rlayer.layer} />
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
  {:else if rlayer && rlayer.layer instanceof QuadsLayer}
    <div class="controls">
      <Button
        expressive
        on:click={() => quadsView.createQuad()}
        icon={AddIcon}
        iconDescription="New quad"
        tooltipPosition="top"
        kind="secondary"
      />
    </div>
  {/if}

</div>

{#if import.meta.env.MODE === 'development'}
  <Stats {time} />
{/if}
