
<script lang="ts">
  import * as Editor from './editor'
  import { server, selected, anim, peers, rmap, map, serverConfig } from '../global'
  import { AnyTilesLayer, GameLayer } from "../../twmap/tilesLayer"
  import { spring } from "svelte/motion"
  import { type Coord, LayerType } from "../../twmap/types"
  import { QuadsLayer } from "../../twmap/quadsLayer"
  import { Image } from '../../twmap/image'
  import QuadsView from "./quadsView.svelte"
  import { onDestroy, onMount } from "svelte"
  import type { CreateEnvelope, CreateGroup, CreateImage, CreateLayer, CreateQuad, Cursors, DeleteEnvelope, DeleteGroup, DeleteImage, DeleteLayer, DeleteQuad, EditEnvelope, EditGroup, EditLayer, EditMap, EditQuad, EditTileParams, ReorderGroup, ReorderLayer } from "../../server/protocol"
  import { RenderQuadsLayer } from "../../gl/renderQuadsLayer"
  import TilePicker from './tilePicker.svelte'
  import BrushEditor from './editBrush.svelte'
  import Stats from './stats.svelte'
  import { RenderAnyTilesLayer } from "../../gl/renderTilesLayer"
  import { viewport, renderer } from '../../gl/global'
  import { externalImageUrl, queryImageData } from './util'
  import MapView from './mapView.svelte'
  import type { RenderGroup } from '../../gl/renderGroup'
  import type { RenderLayer } from '../../gl/renderLayer'

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
  let cursors: { [k: string]: { x: number, y: number } } = {}
  let cursorAnim = spring(cursors)
  $: if ($peers === 1) {
    cursors = {}
    cursorAnim = spring(cursors)
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

  function onCreateQuad(e: CreateQuad) {
    $rmap.createQuad(e)
  }
  function onEditQuad(e: EditQuad) {
    $rmap.editQuad(e)
  }
  function onDeleteQuad(e: DeleteQuad) {
    $rmap.deleteQuad(e)
  }
  function onCreateEnvelope(e: CreateEnvelope) {
    $rmap.createEnvelope(e)
  }
  function onEditEnvelope(e: EditEnvelope) {
    $rmap.editEnvelope(e)
  }
  function onDeleteEnvelope(e: DeleteEnvelope) {
    $rmap.removeEnvelope(e.index)
  }
  function onCreateGroup(e: CreateGroup) {
    $rmap.createGroup(e)
  }
  function onEditGroup(e: EditGroup) {
    $rmap.editGroup(e)
  }
  function onDeleteGroup(e: DeleteGroup) {
    $rmap.deleteGroup(e)
    $selected = $selected
      .filter(([g, _]) => g !== e.group)
      .map(([g, l]) => g > e.group ? [g -1, l] : [g, l])
  }
  function onReorderGroup(e: ReorderGroup) {
    $rmap.reorderGroup(e)
    $selected.pop() // remove active
    const active: [number, number] =
       rlayer ? $rmap.map.layerIndex(rlayer.layer) :
       rgroup ? [$rmap.map.groupIndex(rgroup.group), -1] :
       $rmap.map.physicsLayerIndex(GameLayer)
    $selected = [...$selected, active]
  }
  function onCreateLayer(e: CreateLayer) {
    $rmap.createLayer(e)
  }
  async function onEditLayer(e: EditLayer) {
    $rmap.editLayer(e)
  }
  function onDeleteLayer(e: DeleteLayer) {
    $rmap.deleteLayer(e)
    $selected = $selected.filter(([g, l]) => g !== e.group || l !== e.layer)
    if ($selected.length === 0) {
      $selected = (rgroup.layers.length === 0) ?
        [$rmap.map.physicsLayerIndex(GameLayer)] :
        [[g, Math.min(rgroup.layers.length - 1, e.layer)]]
    }
  }
  function onReorderLayer(e: ReorderLayer) {
    $rmap.reorderLayer(e)
    $selected.pop() // remove active
    const active: [number, number] =
       rlayer ? $rmap.map.layerIndex(rlayer.layer) :
       rgroup ? [$rmap.map.groupIndex(rgroup.group), -1] :
       $rmap.map.physicsLayerIndex(GameLayer)
    $selected = [...$selected, active]
  }
  async function onCreateImage(e: CreateImage) {
    if (e.index !== $rmap.map.images.length)
      return
    if (e.external) {
      const image = new Image()
      image.loadExternal(externalImageUrl(e.name))
      image.name = e.name
      $rmap.addImage(image)
    } else {
      const image = new Image()
      image.name = e.name
      $rmap.addImage(image)
      const data = await queryImageData($serverConfig.httpUrl, $rmap.map.name, e.index)
      image.loadEmbedded(data)
    }
  }
  function onDeleteImage(e: DeleteImage) {
    $rmap.removeImage(e.index)
  }
  async function onEditMap(e: EditMap) {
    $rmap.map.info = e.info
  }

  onMount(() => {
    $rmap = mapView.getRenderMap()
  
    // these event hooks have priority because they manage the state of the map.
    $server.on('createquad', onCreateQuad, true)
    $server.on('editquad', onEditQuad, true)
    $server.on('deletequad', onDeleteQuad, true)
    $server.on('createenvelope', onCreateEnvelope, true)
    $server.on('editenvelope', onEditEnvelope, true)
    $server.on('deleteenvelope', onDeleteEnvelope, true)
    $server.on('editlayer', onEditLayer, true)
    $server.on('editgroup', onEditGroup, true)
    $server.on('creategroup', onCreateGroup, true)
    $server.on('createlayer', onCreateLayer, true)
    $server.on('reordergroup', onReorderGroup, true)
    $server.on('reorderlayer', onReorderLayer, true)
    $server.on('deletegroup', onDeleteGroup, true)
    $server.on('deletelayer', onDeleteLayer, true)
    $server.on('createimage', onCreateImage, true)
    $server.on('deleteimage', onDeleteImage, true)
    $server.on('editmap', onEditMap, true)

    $server.on('cursors', onCursors)
    cursorInterval = setInterval(updateCursors, 100) as any

    renderLoop(0)
  })

  onDestroy(() => {
    destroyed = true
    $server.off('createquad', onCreateQuad)
    $server.off('editquad', onEditQuad)
    $server.off('deletequad', onDeleteQuad)
    $server.off('createenvelope', onCreateEnvelope)
    $server.off('editenvelope', onEditEnvelope)
    $server.off('deleteenvelope', onDeleteEnvelope)
    $server.off('editlayer', onEditLayer)
    $server.off('editgroup', onEditGroup)
    $server.off('creategroup', onCreateGroup)
    $server.off('createlayer', onCreateLayer)
    $server.off('reordergroup', onReorderGroup)
    $server.off('reorderlayer', onReorderLayer)
    $server.off('deletegroup', onDeleteGroup)
    $server.off('deletelayer', onDeleteLayer)
    $server.off('createimage', onCreateImage)
    $server.off('deleteimage', onDeleteImage)
    $server.off('editmap', onEditMap)

    $server.off('cursors', onCursors)

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

  function onCursors(e: Cursors) {
    cursors = Object.fromEntries(Object.entries(e).map(([k, v]) => {
      if (0 <= v.group && v.group < $rmap.groups.length) {
        const rgroup = $rmap.groups[v.group]
        let [ offX, offY ] = rgroup.offset()
        // const [ x, y ] = viewport.worldToCanvas(v.point.x + offX, v.point.y + offY)
        return [k, { x: v.point.x + offX, y: v.point.y + offY }]
      }
      else {
        // const [ x, y ] = viewport.worldToCanvas(v.point.x, v.point.y)
        return [k, v.point]
      }

    }))

    const k1 = Object.keys($cursorAnim).sort()
    const k2 = Object.keys(cursors).sort()
    const eq = k1.length === k2.length && k1.every((k, i) => k === k2[i])

    if (!eq) {
      cursorAnim = spring(cursors, { stiffness: 0.1, damping: 0.7 })
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
    const cursors = await $server.query('cursors', {
      group: g,
      layer: l,
      point: {
        x: viewport.mousePos.x - offX,
        y: viewport.mousePos.y - offY,
      }
    })
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

  function onTilePick(e: CustomEvent<EditTileParams[][]>) {
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
