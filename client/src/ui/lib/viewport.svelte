<script lang="ts">
  import { Viewport } from "../../gl/viewport"
  import * as Editor from './editor'
  import { server, rmap, selected } from '../global'
  import { AnyTilesLayer } from "../../twmap/tilesLayer"
  import { spring } from "svelte/motion"
  import { Coord, LayerType } from "../../twmap/types"
  import { QuadsLayer } from "../../twmap/quadsLayer"
  import QuadsView from "./quadsView.svelte"
  import { onDestroy, onMount } from "svelte"
  import type { Cursors, EditTileParams, ListUsers } from "../../server/protocol"
  import { canvas, renderer, setViewport } from "../../gl/global"
  import { RenderQuadsLayer } from "../../gl/renderQuadsLayer"
  import TilePicker from './tilePicker.svelte'
  import BrushEditor from './editBrush.svelte'
  import Stats from './stats.svelte'
  import { RenderAnyTilesLayer } from "../../gl/renderTilesLayer"

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
  $: layer = rlayer === null ? null : rlayer.layer
  $: selectedTilesLayers = $selected
    .map(([_, l]) => l)
    .filter(l => l !== -1 && $rmap.map.groups[g].layers[l].type === LayerType.TILES)

  let cont: HTMLElement
  let viewport: Viewport

  let time = 0
  let animTime = 0
  export let animEnabled = false
  $: if (!animEnabled) updateEnvelopes(0)

  // brush styling
  let brushOutlineStyle = ''
  let layerOutlineStyle = ''
  let clipOutlineStyle = ''

  // cursors
  let cursorInterval = 0
  let cursors: { [k: string]: { x: number, y: number } } = {}
  let cursorAnim = spring(cursors)
  let peerCount = 0

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
  $: $rmap.setBrush(brushBuffer)
  $: $rmap.moveBrush(mouseRange.start)

  let destroyed = false

  onMount(() => {
    $server.on('listusers', serverOnUsers)
    $server.on('cursors', serverOnCursors)
    cont.prepend(canvas)
    viewport = new Viewport(cont, canvas)
    setViewport(viewport) // TODO remove
    cursorInterval = setInterval(updateCursors, 100) as any

    renderLoop(0)
  })

  onDestroy(() => {
    destroyed = true
    $server.off('listusers', serverOnUsers)
    $server.off('cursors', serverOnCursors)

    clearInterval(cursorInterval)
  })

  function renderLoop(t: DOMHighResTimeStamp) {
    if (destroyed)
      return

    if (animEnabled) {
      animTime += t - time
      updateEnvelopes(animTime)
    }

    renderer.render(viewport, $rmap)
    updateOutlines()
    cursorAnim = cursorAnim // redraw cursors

    time = t

    requestAnimationFrame(renderLoop)
  }

  function serverOnUsers(e: ListUsers) {
    peerCount = e.roomCount
    if (peerCount === 1) {
      cursors = {}
    }
  }

  function serverOnCursors(e: Cursors) {
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
    if (layer instanceof AnyTilesLayer || $selected.length > 1) {
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
    if (layer instanceof AnyTilesLayer || $selected.length > 1) {
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
    if (selectedTilesLayers.length > 0) {
      updateMouseRange()

      if (brushState === BrushState.Select) {
        // end selection
        brushRange.end = mouseRange.end
        brushRange = Editor.normalizeRange(brushRange)
        brushBuffer = Editor.makeBoxSelection($rmap.map, g, selectedTilesLayers, brushRange)
        brushState = BrushState.Paste
        updateMouseRange()
      } else if (brushState === BrushState.Fill) {
        // fill selection with brush buffer
        Editor.fill($server, $rmap, Editor.normalizeRange(mouseRange), brushBuffer)
        brushState = BrushState.Paste
      } else if (brushState === BrushState.Erase) {
        // erase selection
        const range = Editor.normalizeRange(mouseRange)
        const buffer = Editor.makeEmptySelection($rmap.map, g, selectedTilesLayers, range)
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
    if (layer instanceof AnyTilesLayer) {
      const { scale, pos } = viewport
      const [offX, offY] = rgroup.offset()
      layerOutlineStyle = `
        width: ${layer.width * scale}px;
        height: ${layer.height * scale}px;
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
    if (layer instanceof AnyTilesLayer && brushState !== BrushState.Empty) {
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
      const w = (range.end.x - range.start.x + 1) * viewport.scale
      const h = (range.end.y - range.start.y + 1) * viewport.scale

      const brushValid =
        range.start.x >= 0 &&
        range.start.y >= 0 &&
        range.end.x < layer.width &&
        range.end.y < layer.height

      const strokeColor = brushValid ? 'black' : 'red'

      brushOutlineStyle = `
          width: ${w}px;
          height: ${h}px;
          top: ${y}px;
          left: ${x}px;
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
    if (peerCount < 2 || rgroup === null)
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
    serverOnCursors(cursors)
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
</script>


<div
  id="canvas-container"
  bind:this={cont}
  on:mousedown={onMouseDown}
  on:mouseup={onMouseUp}
  on:mousemove={onMouseMove}
  on:contextmenu={onContextMenu}
>
  <!-- Here goes the canvas on mount() -->
  <div id="clip-outline" style={clipOutlineStyle} />
  {#if layer instanceof AnyTilesLayer}
    <div id="brush-outline" style={brushOutlineStyle} />
    <div id="layer-outline" style={layerOutlineStyle} />
  {:else if layer instanceof QuadsLayer}
    <QuadsView layer={layer} />
  {/if}
  {#each Object.values($cursorAnim) as cur}
    <img class="cursor" src="/assets/gui_cursor.png" alt=""
      style:top={(cur.y - viewport.pos.y) * viewport.scale + 'px'}
      style:left={(cur.x - viewport.pos.x) * viewport.scale + 'px'}
    />
  {/each}
  <!-- <Statusbar /> -->
</div>

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

{#if import.meta.env.MODE === 'development'}
  <Stats {time} />
{/if}
