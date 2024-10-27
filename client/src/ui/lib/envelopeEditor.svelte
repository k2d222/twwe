<script lang="ts">
  import type { Envelope } from '../../twmap/map'
  import {
    colorFromJson,
    colorToJson,
    curveTypeFromString,
    curveTypeToString,
    envTypeToString,
    fromFixedNum,
    toFixedNum,
  } from '../../server/convert'
  import { server } from '../global'
  import * as Info from '../../twmap/types'
  import {
    ColorEnvelope,
    PositionEnvelope,
    SoundEnvelope,
    type EnvPoint,
    type EnvPos,
  } from '../../twmap/envelope'
  import ContextMenu from './contextMenu.svelte'
  import { onDestroy, onMount } from 'svelte'
  import { showError } from './dialog'
  import { rmap } from '../global'
  import * as MapDir from '../../twmap/mapdir'
  import type { Send } from '../../server/protocol'
  import { pick, sync, type Syncable } from '../../server/util'

  type FormEvent<T> = Event & { currentTarget: EventTarget & T }
  type InputEvent = FormEvent<HTMLInputElement>

  type Point = {
    x: number
    y: number
    curve: Info.CurveType
  }
  type ViewBox = {
    x: number
    y: number
    w: number
    h: number
  }

  export let e: number = -1

  $: envelope = e === -1 ? null : $rmap.map.envelopes[e]

  let viewBox: ViewBox = { x: 0, y: 0, w: 0, h: 0 }
  let paths: Point[][] = []
  let colors: string[] = []
  let svg: SVGSVGElement

  type Chan =
    | 'color_r'
    | 'color_g'
    | 'color_b'
    | 'color_a'
    | 'pos_x'
    | 'pos_y'
    | 'pos_r'
    | 'sound_v'

  const curves: MapDir.CurveType[] = [
    MapDir.CurveType.Step,
    MapDir.CurveType.Linear,
    MapDir.CurveType.Slow,
    MapDir.CurveType.Fast,
    MapDir.CurveType.Smooth,
    // 'bezier', TODO
  ]

  let colorChannels: Chan[] = ['color_r', 'color_g', 'color_b', 'color_a']
  let posChannels: Chan[] = ['pos_x', 'pos_y', 'pos_r']
  let soundChannels: Chan[] = ['sound_v']

  let channelEnabled: { [k in Chan]: boolean } = {
    color_r: true,
    color_g: true,
    color_b: true,
    color_a: true,
    pos_x: true,
    pos_y: true,
    pos_r: true,
    sound_v: true,
  }

  let channelVal: { [k in Chan]: (x: EnvPoint<any>) => number } = {
    color_r: (x: EnvPoint<any>) => x.content.r,
    color_g: (x: EnvPoint<any>) => x.content.g,
    color_b: (x: EnvPoint<any>) => x.content.b,
    color_a: (x: EnvPoint<any>) => x.content.a,
    pos_x: (x: EnvPoint<any>) => x.content.x,
    pos_y: (x: EnvPoint<any>) => x.content.y,
    pos_r: (x: EnvPoint<any>) => x.content.rotation,
    sound_v: (x: EnvPoint<any>) => x.content,
  }

  let setChannelVal: { [k in Chan]: (x: EnvPoint<any>, val: number) => void } = {
    color_r: (x: EnvPoint<any>, val: number) => (x.content.r = val),
    color_g: (x: EnvPoint<any>, val: number) => (x.content.g = val),
    color_b: (x: EnvPoint<any>, val: number) => (x.content.b = val),
    color_a: (x: EnvPoint<any>, val: number) => (x.content.a = val),
    pos_x: (x: EnvPoint<any>, val: number) => (x.content.x = val),
    pos_y: (x: EnvPoint<any>, val: number) => (x.content.y = val),
    pos_r: (x: EnvPoint<any>, val: number) => (x.content.rotation = val),
    sound_v: (x: EnvPoint<any>, val: number) => (x.content = val),
  }

  type AnyEnvPoints = EnvPoint<number>[] | EnvPoint<EnvPos>[] | EnvPoint<Info.Color>[]
  let syncPoints: Syncable<AnyEnvPoints>

  $: if (envelope) {
    syncPoints = sync($server, clonePoints(envelope.points), {
      query: 'edit/envelope',
      match: [e, { points: pick }],
      apply: points => envPointsFromJson(points),
      send: points => makeEnvPointEdit(points),
    })
  }

  $: viewBox = envelope ? makeViewBox(envelope) : { x: 0, y: 0, w: 0, h: 0 }
  $: sync_, channelEnabled, (paths = envelope ? makePaths(envelope, $syncPoints) : [])
  $: sync_, channelEnabled, (colors = envelope ? makeColors(envelope) : [])

  function clonePoints(points: AnyEnvPoints): AnyEnvPoints {
    return points.map((p: EnvPoint<any>) => ({
      ...p,
      content: typeof p.content === 'object' ? { ...p.content } : p.content,
    }))
  }

  function envPointsFromJson(points: MapDir.EnvelopePoint<any>[]): EnvPoint<any>[] {
    if (envelope instanceof ColorEnvelope) {
      return points.map((p: MapDir.ColorEnvelope['points'][0]) => ({
        time: p.time,
        content: colorFromJson(p.content, 10),
        type: curveTypeFromString(p.type),
      }))
    } else if (envelope instanceof PositionEnvelope) {
      return points.map((p: MapDir.PositionEnvelope['points'][0]) => ({
        time: p.time,
        content: {
          x: fromFixedNum(p.content.x, 15),
          y: fromFixedNum(p.content.y, 15),
          rotation: fromFixedNum(p.content.rotation, 10),
        },
        type: curveTypeFromString(p.type),
      }))
    } else if (envelope instanceof SoundEnvelope) {
      return points.map((p: MapDir.SoundEnvelope['points'][0]) => ({
        time: p.time,
        content: fromFixedNum(p.content, 10),
        type: curveTypeFromString(p.type),
      }))
    } else {
      throw 'unknown envelope type'
    }
  }

  function makeEnvPointEdit(points: EnvPoint<any>[]): Send['edit/envelope'] {
    if (envelope instanceof ColorEnvelope) {
      return [
        e,
        {
          type: MapDir.EnvelopeType.Color,
          points: points.map(p => ({
            time: p.time,
            content: colorToJson(p.content, 10),
            type: curveTypeToString(p.type),
          })),
        },
      ]
    } else if (envelope instanceof PositionEnvelope) {
      return [
        e,
        {
          type: MapDir.EnvelopeType.Position,
          points: points.map(p => ({
            time: p.time,
            content: {
              x: toFixedNum(p.content.x, 15),
              y: toFixedNum(p.content.y, 15),
              rotation: toFixedNum(p.content.rotation, 10),
            },
            type: curveTypeToString(p.type),
          })),
        },
      ]
    } else if (envelope instanceof SoundEnvelope) {
      return [
        e,
        {
          type: MapDir.EnvelopeType.Sound,
          points: points.map(p => ({
            time: p.time,
            content: toFixedNum(p.content, 10),
            type: curveTypeToString(p.type),
          })),
        },
      ]
    } else {
      throw 'unknown envelope type'
    }
  }

  function clampI32(n: number) {
    return clamp(n, -2_147_483_648, 2_147_483_647)
  }

  function clamp(cur: number, min: number, max: number) {
    return Math.min(Math.max(min, cur), max)
  }

  function envChannels(env: Envelope) {
    if (env instanceof ColorEnvelope) return colorChannels
    else if (env instanceof PositionEnvelope) return posChannels
    else if (env instanceof SoundEnvelope) return soundChannels
    else throw 'unknown envelope type'
  }

  const viewBoxMargin = 0.01 // additional space, relative to the viewbox

  function makeViewBox(env: Envelope | null): ViewBox {
    if (env === null || env.points.length === 0) {
      const xMargin = viewBoxMargin * 1000
      return { x: -xMargin, y: -1024, w: 1000 + 2 * xMargin, h: 2048 }
    }

    const allPoints = envChannels(env)
      .map(c => env.points.map((p: EnvPoint<any>) => channelVal[c](p)))
      .flat()

    let minX = -viewBoxMargin
    let maxX = Math.max(1000, env.points[env.points.length - 1].time)
    let maxY = Math.max.apply(
      null,
      allPoints.map(p => Math.abs(p))
    )
    let minY = -maxY

    if (maxY === 0) {
      // no point
      minY = -1024
      maxY = 1024
    }

    const xMargin = viewBoxMargin * (maxX - minX)
    minX -= xMargin
    maxX += xMargin

    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }

  function scaleViewBox(vb: ViewBox, scale: number) {
    let { x, y, w, h } = vb
    const middleY = y + h / 2
    x = -viewBoxMargin * w * scale
    y = (y - middleY) * scale + middleY
    w *= scale
    h *= scale

    return { x, y, w, h }
  }

  function makePath(points: AnyEnvPoints, chan: Chan) {
    const x = points.map((p: EnvPoint<any>) => p.time)
    const y = points.map((p: EnvPoint<any>) => -channelVal[chan](p)) // notice the minus sign to flip the y axis

    return x.map((_, i) => {
      return { x: x[i], y: y[i], curve: points[i].type }
    })
  }

  function makePaths(env: Envelope, points: AnyEnvPoints) {
    return envChannels(env)
      .filter(c => channelEnabled[c])
      .map(c => makePath(points, c))
  }

  function makeColors(env: Envelope) {
    const colors = ['red', 'green', 'blue', 'orange']
    const channels = envChannels(env)
    const res = []

    for (const i in channels) if (channelEnabled[channels[i]]) res.push(colors[i])

    return res
  }

  function pixelToSvg(x: number, y: number) {
    const rect = svg.getBoundingClientRect()
    const px = ((x - rect.left) / rect.width) * viewBox.w + viewBox.x
    const py = ((y - rect.top) / rect.height) * viewBox.h + viewBox.y
    return [px, -py] // notice the minus sign to flip the y axis
  }

  function viewBoxStr(viewBox: ViewBox) {
    const { x, y, w, h } = viewBox
    return `${x} ${y} ${w} ${h}`
  }

  function curveStr(p1: Point, p2: Point) {
    if (p1.curve === Info.CurveType.STEP) {
      return `M${p1.x},${p1.y} H${p2.x} V${p2.y}`
    }
    if (p1.curve === Info.CurveType.LINEAR) {
      return `M${p1.x},${p1.y} L${p2.x},${p2.y}`
    } else if (p1.curve === Info.CurveType.SLOW) {
      // x^3, bezier approx. solved by bruteforce with steps of 0.1
      let cp1 = { x: 0.6, y: 0.0 }
      let cp2 = { x: 0.8, y: 0.4 }
      cp1 = { x: p1.x + cp1.x * (p2.x - p1.x), y: p1.y + cp1.y * (p2.y - p1.y) }
      cp2 = { x: p1.x + cp2.x * (p2.x - p1.x), y: p1.y + cp2.y * (p2.y - p1.y) }
      return `M${p1.x},${p1.y} C${cp1.x},${cp1.y},${cp2.x},${cp2.y},${p2.x},${p2.y}`
    } else if (p1.curve === Info.CurveType.FAST) {
      // 1 - (1 - x)^3, bezier approx. solved by bruteforce with steps of 0.1
      let cp1 = { x: 0.2, y: 0.6 }
      let cp2 = { x: 0.4, y: 1.0 }
      cp1 = { x: p1.x + cp1.x * (p2.x - p1.x), y: p1.y + cp1.y * (p2.y - p1.y) }
      cp2 = { x: p1.x + cp2.x * (p2.x - p1.x), y: p1.y + cp2.y * (p2.y - p1.y) }
      return `M${p1.x},${p1.y} C${cp1.x},${cp1.y},${cp2.x},${cp2.y},${p2.x},${p2.y}`
    } else if (p1.curve === Info.CurveType.SMOOTH) {
      // 3x^2 - 2x^3, bezier approx. solved by bruteforce with steps of 0.1
      let cp1 = { x: 0.3, y: 0.0 }
      let cp2 = { x: 0.7, y: 1.0 }
      cp1 = { x: p1.x + cp1.x * (p2.x - p1.x), y: p1.y + cp1.y * (p2.y - p1.y) }
      cp2 = { x: p1.x + cp2.x * (p2.x - p1.x), y: p1.y + cp2.y * (p2.y - p1.y) }
      return `M${p1.x},${p1.y} C${cp1.x},${cp1.y},${cp2.x},${cp2.y},${p2.x},${p2.y}`
    } else {
      // default to linear
      return `M${p1.x},${p1.y} L${p2.x},${p2.y}`
    }
  }

  function pointStr(x: number, y: number) {
    return `M${x},${y} M${x},${y} Z`
  }

  let sync_ = 0
  function onSync() {
    if (envelope && $rmap.map.envelopes.length === 0) e = -1
    else if (envelope && $rmap.map.envelopes.indexOf(envelope) === -1)
      e = $rmap.map.envelopes.length - 1
    else if (envelope === null && $rmap.map.envelopes.length !== 0) e = 0
    sync_++
  }

  onMount(() => {
    $server.on('create/envelope', onSync)
    $server.on('edit/envelope', onSync)
    $server.on('delete/envelope', onSync)
    e = $rmap.map.envelopes.length - 1
  })

  onDestroy(() => {
    $server.off('create/envelope', onSync)
    $server.off('edit/envelope', onSync)
    $server.off('delete/envelope', onSync)
  })

  async function onRename(e: InputEvent) {
    if (!envelope) return
    const change: Send['edit/envelope'] = [
      $rmap.map.envelopes.indexOf(envelope),
      {
        type: envTypeToString(envelope.type),
        name: e.currentTarget.value,
      },
    ]
    try {
      await $server.query('edit/envelope', change)
    } catch (e) {
      showError('Failed to rename envelope: ' + e)
    }
  }

  async function onNewEnv(ev: FormEvent<HTMLSelectElement>) {
    const type: MapDir.EnvelopeType = ev.currentTarget.value as any
    ev.currentTarget.selectedIndex = 0 // reset the select to the default value
    const change: Send['create/envelope'] = {
      type,
      name: '',
    }
    try {
      await $server.query('create/envelope', change)
      e = $rmap.map.envelopes.length - 1
    } catch (e) {
      showError('Failed to create envelope: ' + e)
    }
  }

  async function onDelete() {
    if (!envelope) return
    const index = $rmap.map.envelopes.indexOf(envelope)
    try {
      await $server.query('delete/envelope', index)
      e = index - 1
    } catch (e) {
      showError('Failed to delete envelope: ' + e)
    }
  }

  let activePath = -1
  let activePoint = -1

  function onMouseDown(e: MouseEvent, i: number, j: number) {
    if (e.button === 0) {
      activePath = i
      activePoint = j
    } else {
      activePath = -1
      activePoint = -1
    }
  }

  function onMouseUp() {
    if (activePath !== -1 && activePoint !== -1) {
      syncPoints.sync($syncPoints)

      activePath = -1
      activePoint = -1
    }
  }

  function onMouseMove(e: MouseEvent) {
    if (!envelope) return
    if (activePath !== -1 && activePoint !== -1) {
      const chan = envChannels(envelope)[activePath]
      const point = $syncPoints[activePoint]
      const prev = $syncPoints[Math.max(0, activePoint - 1)]
      const next = $syncPoints[Math.min($syncPoints.length - 1, activePoint + 1)]
      let [px, py] = pixelToSvg(e.clientX, e.clientY)

      px = Math.max(0, px) // env times must be >= 0
      px = Math.min(Math.max(viewBox.x, px), viewBox.x + viewBox.w)
      py = Math.min(Math.max(viewBox.y, py), viewBox.y + viewBox.h)

      if (point !== next) px = Math.min(px, next.time)
      if (point !== prev) px = Math.max(px, prev.time)

      px = Math.floor(px)
      py = Math.floor(py)

      point.time = px
      setChannelVal[chan](point, py)

      onSync()
    }
  }

  function onResize() {}

  let cm_i: number = -1 // which channel is selected
  let cm_j: number = -1 // which point is selected
  let cm_k: number = -1 // which point (curve) is selected
  let cm_x = 0
  let cm_y = 0

  function showCM(e: MouseEvent, i: number, j: number, k: number) {
    e.preventDefault()
    cm_x = e.clientX
    cm_y = e.clientY
    cm_i = i
    cm_j = j
    cm_k = k
  }

  function hideCM() {
    cm_i = -1
    cm_j = -1
    cm_k = -1
  }

  function onEditValue(e: InputEvent) {
    if (!envelope) return
    const point = $syncPoints[cm_j]
    const chan = envChannels(envelope)[cm_i]
    const val = clampI32(Math.floor(parseFloat(e.currentTarget.value) * 1024))

    if (isNaN(val)) return

    setChannelVal[chan](point, val)

    syncPoints.sync($syncPoints)
  }

  function onEditTime(e: InputEvent) {
    if (!envelope) return
    const point = $syncPoints[cm_j]
    const prev = $syncPoints[Math.max(0, cm_j - 1)]
    const next = $syncPoints[Math.min($syncPoints.length - 1, cm_j + 1)]
    let val = clampI32(Math.floor(parseFloat(e.currentTarget.value) * 1000))

    if (isNaN(val)) return

    val = Math.max(0, val) // env point time must be >= O

    if (point !== next) val = Math.min(val, next.time)
    if (point !== prev) val = Math.max(val, prev.time)

    point.time = val

    syncPoints.sync($syncPoints)
  }

  function onDeletePoint() {
    if (!envelope) return
    $syncPoints.splice(cm_j, 1)
    cm_j = -1

    syncPoints.sync($syncPoints)
  }

  function onEditCurve(e: FormEvent<HTMLSelectElement>) {
    if (!envelope) return
    const point = $syncPoints[cm_k]
    const val: Info.CurveType = clampI32(parseInt(e.currentTarget.value))
    point.type = val

    syncPoints.sync($syncPoints)
  }

  function onMouseWheel(e: WheelEvent) {
    const direction = e.deltaY < 0 ? -1 : 1
    viewBox = scaleViewBox(viewBox, 1 + direction * 0.1)
  }

  function onRescale() {
    viewBox = makeViewBox(envelope)
  }

  function addPoint(e: MouseEvent) {
    if (!envelope) return
    if (!(e.target instanceof SVGSVGElement) || e.button !== 0) return

    let [px, _] = pixelToSvg(e.clientX, e.clientY)
    px = Math.floor(px)

    if (px < 0)
      // point time must be >= 0
      return

    let nextIndex = $syncPoints.findIndex((p: EnvPoint<any>) => p.time >= px)
    if (nextIndex === -1) nextIndex = $syncPoints.length
    else if ($syncPoints[nextIndex].time === px)
      // don't add another point on top
      return

    const newPoint: EnvPoint<any> = {
      type: Info.CurveType.LINEAR,
      time: px,
      content: envelope.computePoint(px),
    }

    // floor channel values
    for (const chan of envChannels(envelope))
      setChannelVal[chan](newPoint, Math.floor(channelVal[chan](newPoint)))

    $syncPoints.splice(nextIndex, 0, newPoint)

    syncPoints.sync($syncPoints)
  }
</script>

<svelte:window on:resize={onResize} on:mousemove={onMouseMove} on:mouseup={onMouseUp} />

{#key sync_}
  <div id="envelope-editor">
    <div class="header">
      {#if envelope}
        <select bind:value={e}>
          {#each $rmap.map.envelopes as env, i}
            <option value={i}>
              {`#${i} ${env.name || ''} (${envTypeToString(env.type)})`}
            </option>
          {/each}
        </select>
        <label>
          <input type="text" value={envelope.name} placeholder="(unnamed)" on:change={onRename} />
        </label>
        <div class="channels">
          {#if envelope instanceof ColorEnvelope}
            <label class="red">
              <input type="checkbox" bind:checked={channelEnabled.color_r} />
              <span>R</span>
            </label>
            <label class="green">
              <input type="checkbox" bind:checked={channelEnabled.color_g} />
              <span>G</span>
            </label>
            <label class="blue">
              <input type="checkbox" bind:checked={channelEnabled.color_b} />
              <span>B</span>
            </label>
            <label class="orange">
              <input type="checkbox" bind:checked={channelEnabled.color_a} />
              <span>A</span>
            </label>
          {:else if envelope instanceof PositionEnvelope}
            <label class="red">
              <input type="checkbox" bind:checked={channelEnabled.pos_x} />
              <span>X</span>
            </label>
            <label class="green">
              <input type="checkbox" bind:checked={channelEnabled.pos_y} />
              <span>Y</span>
            </label>
            <label class="blue">
              <input type="checkbox" bind:checked={channelEnabled.pos_r} />
              <span>R</span>
            </label>
          {:else if envelope instanceof SoundEnvelope}
            <label class="red">
              <input type="checkbox" bind:checked={channelEnabled.sound_v} />
              <span>V</span>
            </label>
          {/if}
        </div>
        <button class="default" on:click={onRescale}>Rescale</button>
      {/if}
      <div class="buttons">
        <select on:change={onNewEnv}>
          <option selected disabled>New envelope…</option>
          <option value="color">Color</option>
          <option value="position">Position</option>
          <option value="sound">Sound</option>
        </select>
        {#if envelope}
          <button class="danger" on:click={onDelete} disabled={envelope === null}>Delete</button>
        {/if}
      </div>
    </div>

    <div class="graph" on:wheel={onMouseWheel}>
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <svg
        viewBox={viewBoxStr(viewBox)}
        preserveAspectRatio="none"
        bind:this={svg}
        on:mousedown={addPoint}
      >
        {#each paths as path, i}
          {@const col = colors[i]}
          {#each path as p, k}
            {#if k !== 0}
              {@const p2 = path[k - 1]}
              <path
                d={curveStr(p2, p)}
                style:stroke={col}
                on:contextmenu={e => showCM(e, i, -1, k - 1)}
              />
            {/if}
          {/each}
          {#each path as p, j}
            <!-- not using the circle becausePointthe path stroke can be screen-space sized but not the circle fill. -->
            <path
              class="point"
              d={pointStr(p.x, p.y)}
              style:stroke={col}
              on:mousedown={e => onMouseDown(e, i, j)}
              on:contextmenu={e => showCM(e, i, j, -1)}
            />
          {/each}
        {/each}
        <line x1={viewBox.x} y1={0} x2={viewBox.x + viewBox.w} y2={0} class="axis" />
        <!-- the y=0 line -->
        {#each Array.from({ length: Math.ceil(viewBox.w / 1000) }) as _, i}
          <line
            x1={i * 1000}
            y1={viewBox.y}
            x2={i * 1000}
            y2={viewBox.y + viewBox.h}
            class="axis"
          />
          <!-- the x=i line -->
        {/each}
      </svg>
    </div>
  </div>

  {#if cm_i !== -1 && cm_j !== -1}
    {@const p = paths[cm_i][cm_j]}
    <ContextMenu x={cm_x} y={cm_y} on:close={hideCM}>
      <div class="edit-env-point">
        <label>
          Time <input type="number" min={0} value={p.x / 1000} on:change={onEditTime} />
        </label>
        <label>
          Value <input type="number" value={-p.y / 1024} on:change={onEditValue} />
        </label>
        <button class="danger" on:click={onDeletePoint}>Delete</button>
      </div>
    </ContextMenu>
  {:else if cm_i !== -1 && cm_k !== -1}
    {@const p = paths[cm_i][cm_k]}
    <ContextMenu x={cm_x} y={cm_y} on:close={hideCM}>
      <div class="edit-env-point">
        <label>
          Curve <select on:change={onEditCurve}>
            {#each curves as c, i}
              <option value={i} selected={i === p.curve}>{c}</option>
            {/each}
          </select>
        </label>
      </div>
    </ContextMenu>
  {/if}
{/key}
