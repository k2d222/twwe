<script lang="ts">
  import type { QuadsLayer, Quad } from '../../twmap/quadsLayer'
  import type * as Info from '../../twmap/types'
  import { viewport } from '../../gl/global'
  import { onMount, onDestroy } from 'svelte'
  import ContextMenu from './contextMenu.svelte'
  import QuadEditor from './editQuad.svelte'
  import { server } from '../global'
  import { layerIndex } from './util'
  import { coordToJson, resIndexToString, uvToJson } from '../../server/convert'
  import { rmap } from '../global'
  import type { Send } from '../../server/protocol'
  import * as Editor from './editor'

  export let layer: QuadsLayer

  let viewBox: string
  let circleRadius: number

  let quadPoints: Info.Coord[][]
  $: {
    sync_
    quadPoints = layer.quads.map(q => {
      return [...q.points]
    })
  }
  $: [g, l] = layerIndex($rmap.map, layer)

  onMount(() => {
    Editor.on('keypress', onKeyPress)
  })

  onDestroy(() => {
    Editor.off('keypress', onKeyPress)
  })

  function onKeyPress(e: KeyboardEvent) {
    if (e.ctrlKey && ['q'].includes(e.key)) {
      e.preventDefault()

      if (e.key === 'q') createQuad()
    }
  }

  function quadPointsStr(points: Info.Coord[]) {
    const toStr = (p: Info.Coord) => p.x / 1024 + ',' + p.y / 1024
    const topLeft = points[0]
    const topRight = points[1]
    const bottomLeft = points[2]
    const bottomRight = points[3]
    return [toStr(topLeft), toStr(topRight), toStr(bottomRight), toStr(bottomLeft)].join(' ')
  }

  function makeViewBox() {
    const rect = viewport.cont.getBoundingClientRect()
    const [x1, y1] = viewport.pixelToWorld(rect.left, rect.top)
    const [x2, y2] = viewport.pixelToWorld(rect.right, rect.bottom)
    const rgroup = $rmap.groups[g]
    const [offX, offY] = rgroup.offset()
    return [x1 - offX, y1 - offY, x2 - x1, y2 - y1].map(x => x * 32).join(' ')
  }

  let destroyed = false

  onMount(() => {
    $server.on('edit/quad', onSync)
    $server.on('create/quad', onSync)
    $server.on('delete/quad', onSync)
  
    const updateForever = () => {
      viewBox = makeViewBox()
      circleRadius = 100 / viewport.scale
      if (!destroyed) requestAnimationFrame(updateForever)
    }
    updateForever()
  })

  onDestroy(() => {
    $server.off('edit/quad', onSync)
    $server.off('create/quad', onSync)
    $server.off('delete/quad', onSync)
    destroyed = true
  })

  let activeQuad = -1
  let lastEdit: Send['edit/quad'] | null = null
  let startPos = { x: 0, y: 0 }
  let lastPos = { x: 0, y: 0 }
  let selectedPoints: number[] = []

  function onMouseDown(e: MouseEvent, q: number, lp: number[]) {
    if (e.buttons === 1 && !e.ctrlKey) {
      activeQuad = q
      lastEdit = editQuad(q)
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
    $rmap.editQuad(...change)
    onSync()
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
    lastEdit = editQuad(q)
  }

  function hideCM() {
    cm_q = -1
    cm_p = -1
  }

  function onChange(q: number) {
    const edit = editQuad(q)
    $rmap.editQuad(...lastEdit)
    lastEdit = edit
    $server.send('edit/quad', edit)
  }

  function onDelete(q: number) {
    hideCM()
    $server.query('delete/quad', [g, l, q])
  }

  export function createQuad() {
    const { x1, y1, x2, y2 } = viewport.screen()
    const mx = Math.floor(((x1 + x2) / 2) * 32 * 1024)
    const my = Math.floor(((y1 + y2) / 2) * 32 * 1024)
    const w = (layer.image ? layer.image.width : 64) * 1024
    const h = (layer.image ? layer.image.height : 64) * 1024

    // TODO: use defaults
    const create: Send['create/quad'] = [
      g, l,
      {
        position: coordToJson({ x: mx, y: my }, 15),
        corners: [
          { x: -w / 2 + mx, y: -h / 2 + my }, // top left
          { x: w / 2 + mx, y: -h / 2 + my }, // top right
          { x: -w / 2 + mx, y: h / 2 + my }, // bottom left
          { x: w / 2 + mx, y: h / 2 + my }, // bottom right
        ].map(p => coordToJson(p, 15)),
        colors: [
          { r: 255, g: 255, b: 255, a: 255 },
          { r: 255, g: 255, b: 255, a: 255 },
          { r: 255, g: 255, b: 255, a: 255 },
          { r: 255, g: 255, b: 255, a: 255 },
        ],
        texture_coords: [
          { x: 0, y: 0 },
          { x: 1024, y: 0 },
          { x: 0, y: 1024 },
          { x: 1024, y: 1024 },
        ].map(p => uvToJson(p, 10)),
        position_env: null,
        position_env_offset: 0,
        color_env: null,
        color_env_offset: 0,
      }
    ]

    hideCM()
    $server.query('create/quad', create)
  }

  function cloneQuad(quad: Quad) {
    const copy: Quad = {
      ...quad,
      points: quad.points.map(({ x, y }) => ({ x, y })),
      colors: quad.colors.map(({ r, g, b, a}) => ({ r, g, b, a })),
      texCoords: quad.texCoords.map(({ x, y }) => ({ x, y })),
    }

    return copy
  }

  function editQuad(q: number): Send['edit/quad'] {
    const quad = layer.quads[q]
    const { points, colors, texCoords, posEnv, posEnvOffset, colorEnv, colorEnvOffset } = quad
    const posEnv_ = $rmap.map.envelopes.indexOf(posEnv)
    const colorEnv_ = $rmap.map.envelopes.indexOf(colorEnv)

    return [
      g, l, q,
      {
        position: coordToJson(points[4], 15),
        corners: points.slice(0, 4).map(p => coordToJson(p, 15)),
        colors,
        texture_coords: texCoords.map(p => uvToJson(p, 10)),
        position_env: posEnv_ === -1 ? null : resIndexToString(posEnv_, posEnv.name),
        position_env_offset: posEnvOffset,
        color_env: colorEnv_ === -1 ? null : resIndexToString(colorEnv_, colorEnv.name),
        color_env_offset: colorEnvOffset,
      }
    ]
  }

  function onDuplicate(q: number) {
    const quad = cloneQuad(layer.quads[q])
    const { colors, texCoords, posEnv, posEnvOffset, colorEnv, colorEnvOffset } = quad
    const posEnv_ = $rmap.map.envelopes.indexOf(posEnv)
    const colorEnv_ = $rmap.map.envelopes.indexOf(colorEnv)
    const points = quad.points.map(p => {
      return { x: p.x + 10 * 1024, y: p.y + 10 * 1024 }
    })

    const change: Send['create/quad'] = [
      g, l,
      {
        position: coordToJson(points[4], 15),
        corners: points.slice(0, 4).map(p => coordToJson(p, 15)),
        colors,
        texture_coords: texCoords.map(p => uvToJson(p, 10)),
        position_env: posEnv_ === -1 ? null : resIndexToString(posEnv_, posEnv.name),
        position_env_offset: posEnvOffset,
        color_env: colorEnv_ === -1 ? null : resIndexToString(colorEnv_, colorEnv.name),
        color_env_offset: colorEnvOffset,
      }
    ]

    hideCM()
    $server.query('create/quad', change)
  }

  let sync_ = 0
  function onSync() {
    sync_++
  }
</script>

{#key sync_}
<div id="quads-view">
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <svg
    {viewBox}
    xmlns="http://www.w3.org/2000/svg"
    on:mousemove={onMouseMove}
    on:mouseup={onMouseUp}
  >
    {#each quadPoints as _, q}
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
        {quad}
        p={cm_p}
        on:change={() => onChange(cm_q)}
        on:delete={() => onDelete(cm_q)}
        on:duplicate={() => onDuplicate(cm_q)}
      />
    </ContextMenu>
  {/if}
</div>
{/key}
