<script lang="ts">
  import type { RenderMap } from '../../gl/renderMap'
  import type { QuadsLayer, Quad } from '../../twmap/quadsLayer'
  import type { CreateQuad, EditQuad } from 'src/server/protocol'
  import type * as Info from '../../twmap/types'
  import { viewport } from '../../gl/global'
  import { onMount, onDestroy } from 'svelte'
  import ContextMenu from './contextMenu.svelte'
  import QuadEditor from './editQuad.svelte'
  import { server } from '../global'
  import { layerIndex } from './util'
  import { showInfo, showError, clearDialog } from './dialog'
  import { Button } from 'carbon-components-svelte'
  import {
    Add as AddIcon,
  } from 'carbon-icons-svelte'


  export let rmap: RenderMap
  export let layer: QuadsLayer

  let viewBox: string
  let circleRadius: number

  $: quadPoints = layer.quads.map(q => {
    return [...q.points]
  })
  $: [g, l] = layerIndex(rmap.map, layer)

  function quadPointsStr(points: Info.Coord[]) {
    const toStr = (p: Info.Coord) => p.x / 1024 + ',' + p.y / 1024
    const topLeft = points[0]
    const topRight = points[1]
    const bottomLeft = points[2]
    const bottomRight = points[3]
    return [toStr(topLeft), toStr(topRight), toStr(bottomRight), toStr(bottomLeft)].join(' ')
  }

  function makeViewBox() {
    const { x1, y1, x2, y2 } = viewport.screen()
    const rgroup = rmap.groups[g]
    const [offX, offY] = rgroup.offset()
    return [x1 - offX, y1 - offY, x2 - x1, y2 - y1].map(x => x * 32).join(' ')
  }

  let destroyed = false

  onMount(() => {
    const updateForever = () => {
      viewBox = makeViewBox()
      circleRadius = 100 / viewport.scale + 1
      if (!destroyed) requestAnimationFrame(updateForever)
    }
    updateForever()
  })

  onDestroy(() => {
    destroyed = true
  })

  let activeQuad = -1
  let startPos = { x: 0, y: 0 }
  let lastPos = { x: 0, y: 0 }
  let selectedPoints: number[] = []

  function onMouseDown(e: MouseEvent, q: number, lp: number[]) {
    if (e.buttons === 1 && !e.ctrlKey) {
      activeQuad = q
      selectedPoints = lp
      const [x, y] = viewport.pixelToWorld(e.clientX, e.clientY)
      startPos.x = x
      startPos.y = y
      lastPos.x = x
      lastPos.y = y
    }
  }

  function onMouseMove(e: MouseEvent) {
    if (activeQuad === -1) return

    const points = quadPoints[activeQuad]
    let [x, y] = viewport.pixelToWorld(e.clientX, e.clientY)

    // reset position as it was before drag start
    for (let p of selectedPoints) {
      points[p].x -= Math.floor((lastPos.x - startPos.x) * 32 * 1024)
      points[p].y -= Math.floor((lastPos.y - startPos.y) * 32 * 1024)
    }

    // project the mouse move on the normal if 2 points are selected
    if (selectedPoints.length === 2) {
      const p1 = points[selectedPoints[0]]
      const p2 = points[selectedPoints[1]]
      const dir = {
        x: x - startPos.x,
        y: y - startPos.y,
      }
      const normal = {
        x: p1.y - p2.y,
        y: p2.x - p1.x,
      }
      const len = Math.sqrt(normal.x * normal.x + normal.y * normal.y)
      normal.x /= len
      normal.y /= len
      const dot = dir.x * normal.x + dir.y * normal.y
      x = startPos.x + normal.x * dot
      y = startPos.y + normal.y * dot
    }

    // set new points positions
    for (let p of selectedPoints) {
      points[p].x += Math.floor((x - startPos.x) * 32 * 1024)
      points[p].y += Math.floor((y - startPos.y) * 32 * 1024)
    }

    lastPos.x = x
    lastPos.y = y

    quadPoints = quadPoints // hack to redraw quad

    const change = editQuad(activeQuad)
    rmap.editQuad(change)
  }

  function onMouseUp(e: MouseEvent) {
    if (e.button === 0 && activeQuad !== -1) {
      layer.quads[activeQuad].points = quadPoints[activeQuad]
      onChange(activeQuad)
      activeQuad = -1
    }
  }

  let cm_q: number = -1
  let cm_p: number = -1
  let cm_x = 0
  let cm_y = 0

  function showCM(e: MouseEvent, q: number, p: number) {
    e.preventDefault()
    cm_x = e.clientX
    cm_y = e.clientY
    cm_q = q
    cm_p = p
  }

  function hideCM() {
    cm_q = -1
    cm_p = -1
  }

  function onChange(q: number) {
    const change = editQuad(q)
    rmap.editQuad(change)
    $server.send('editquad', change)
    quadPoints = quadPoints // hack to redraw
  }

  function onDelete(q: number) {
    try {
      showInfo('Please wait…')
      const change = { group: g, layer: l, quad: q }
      $server.query('deletequad', change)
      rmap.deleteQuad(change)
      hideCM()
      layer = layer
      clearDialog()
    } catch (e) {
      showError('Failed to delete quad: ' + e)
    }
  }

  function onCreateQuad() {
    const { x1, y1, x2, y2 } = viewport.screen()
    const mx = Math.floor(((x1 + x2) / 2) * 32 * 1024)
    const my = Math.floor(((y1 + y2) / 2) * 32 * 1024)
    const w = (layer.image ? layer.image.width : 64) * 1024
    const h = (layer.image ? layer.image.height : 64) * 1024

    const change: CreateQuad = {
      group: g,
      layer: l,
      points: [
        { x: -w / 2 + mx, y: -h / 2 + my }, // top left
        { x: w / 2 + mx, y: -h / 2 + my }, // top right
        { x: -w / 2 + mx, y: h / 2 + my }, // bottom left
        { x: w / 2 + mx, y: h / 2 + my }, // bottom right
        { x: mx, y: my }, // center
      ],
      colors: [
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 255, g: 255, b: 255, a: 255 },
      ],
      texCoords: [
        { x: 0, y: 0 },
        { x: 1024, y: 0 },
        { x: 0, y: 1024 },
        { x: 1024, y: 1024 },
      ],
      posEnv: null,
      posEnvOffset: 0,
      colorEnv: null,
      colorEnvOffset: 0,
    }

    try {
      showInfo('Please wait…')
      $server.query('createquad', change)
      rmap.createQuad(change)
      layer = layer
      clearDialog()
    } catch (e) {
      showError('Failed to create quad: ' + e)
    }
  }

  function cloneQuad(quad: Quad) {
    const copy: Quad = {
      points: quad.points.map(p => {
        return { x: p.x, y: p.y }
      }),
      colors: quad.colors.map(c => {
        return { r: c.r, g: c.g, b: c.b, a: c.a }
      }),
      texCoords: quad.texCoords.map(p => {
        return { x: p.x, y: p.y }
      }),
      ...quad,
    }

    return copy
  }

  function editQuad(q: number): EditQuad {
    const quad = layer.quads[q]
    const { points, colors, texCoords, posEnv, posEnvOffset, colorEnv, colorEnvOffset } = quad
    const posEnv_ = rmap.map.envelopes.indexOf(posEnv)
    const colorEnv_ = rmap.map.envelopes.indexOf(colorEnv)

    return {
      group: g,
      layer: l,
      quad: q,
      points,
      colors,
      texCoords,
      posEnv: posEnv_ === -1 ? null : posEnv_,
      posEnvOffset,
      colorEnv: colorEnv_ === -1 ? null : colorEnv_,
      colorEnvOffset,
    }
  }

  function onDuplicate(q: number) {
    const quad = cloneQuad(layer.quads[q])
    const { colors, texCoords, posEnv, posEnvOffset, colorEnv, colorEnvOffset } = quad
    const posEnv_ = rmap.map.envelopes.indexOf(posEnv)
    const colorEnv_ = rmap.map.envelopes.indexOf(colorEnv)
    const points = quad.points.map(p => {
      return { x: p.x + 10 * 1024, y: p.y + 10 * 1024 }
    })

    const change: CreateQuad = {
      group: g,
      layer: l,
      points,
      colors,
      texCoords,
      posEnv: posEnv_ === -1 ? null : posEnv_,
      posEnvOffset,
      colorEnv: colorEnv_ === -1 ? null : colorEnv_,
      colorEnvOffset,
    }

    try {
      showInfo('Please wait…')
      $server.query('createquad', change)
      rmap.createQuad(change)
      hideCM()
      layer = layer
      clearDialog()
    } catch (e) {
      showError('Failed to duplicate quad: ' + e)
    }
  }
</script>

<div id="edit-quads">
  <svg
    {viewBox}
    xmlns="http://www.w3.org/2000/svg"
    on:mousemove={onMouseMove}
    on:mouseup={onMouseUp}
  >
    {#each layer.quads as _, q}
      {@const points = quadPoints[q]}
      <polygon
        points={quadPointsStr(points)}
        on:mousedown={e => onMouseDown(e, q, [0, 1, 2, 3, 4])}
      />
      <line
        x1={points[0].x / 1024}
        y1={points[0].y / 1024}
        x2={points[1].x / 1024}
        y2={points[1].y / 1024}
        on:mousedown={e => onMouseDown(e, q, [0, 1])}
      />
      <line
        x1={points[1].x / 1024}
        y1={points[1].y / 1024}
        x2={points[3].x / 1024}
        y2={points[3].y / 1024}
        on:mousedown={e => onMouseDown(e, q, [1, 3])}
      />
      <line
        x1={points[3].x / 1024}
        y1={points[3].y / 1024}
        x2={points[2].x / 1024}
        y2={points[2].y / 1024}
        on:mousedown={e => onMouseDown(e, q, [3, 2])}
      />
      <line
        x1={points[2].x / 1024}
        y1={points[2].y / 1024}
        x2={points[0].x / 1024}
        y2={points[0].y / 1024}
        on:mousedown={e => onMouseDown(e, q, [2, 0])}
      />
      <circle
        cx={points[0].x / 1024}
        cy={points[0].y / 1024}
        r={circleRadius}
        on:mousedown={e => onMouseDown(e, q, [0])}
        on:contextmenu={e => showCM(e, q, 0)}
      />
      <circle
        cx={points[1].x / 1024}
        cy={points[1].y / 1024}
        r={circleRadius}
        on:mousedown={e => onMouseDown(e, q, [1])}
        on:contextmenu={e => showCM(e, q, 1)}
      />
      <circle
        cx={points[2].x / 1024}
        cy={points[2].y / 1024}
        r={circleRadius}
        on:mousedown={e => onMouseDown(e, q, [2])}
        on:contextmenu={e => showCM(e, q, 2)}
      />
      <circle
        cx={points[3].x / 1024}
        cy={points[3].y / 1024}
        r={circleRadius}
        on:mousedown={e => onMouseDown(e, q, [3])}
        on:contextmenu={e => showCM(e, q, 3)}
      />
      <circle
        cx={points[4].x / 1024}
        cy={points[4].y / 1024}
        r={circleRadius}
        class="center"
        on:mousedown={e => onMouseDown(e, q, [4])}
        on:contextmenu={e => showCM(e, q, 4)}
      />
    {/each}
  </svg>
  {#if cm_q !== -1}
    {@const quad = layer.quads[cm_q]}
    <ContextMenu x={cm_x} y={cm_y} on:close={hideCM}>
      <QuadEditor
        {rmap}
        {quad}
        p={cm_p}
        on:change={() => onChange(cm_q)}
        on:delete={() => onDelete(cm_q)}
        on:duplicate={() => onDuplicate(cm_q)}
      />
    </ContextMenu>
  {/if}
  <div class="controls">
    <Button
      expressive
      on:click={onCreateQuad}
      icon={AddIcon}
      iconDescription="Tile picker"
      tooltipPosition="top"
      kind="secondary"
    />
  </div>
</div>
