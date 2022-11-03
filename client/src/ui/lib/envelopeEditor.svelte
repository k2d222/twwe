<script lang="ts">
  import type { Envelope } from '../../twmap/map'
  import type { RenderMap } from '../../gl/renderMap'
  import { CreateEnvelope, EditEnvelope, DeleteEnvelope, CurveTypeStr, envTypes } from '../../server/protocol'
  import { envPointToJson } from '../../server/convert';
  import { server } from '../global'
  import * as Info from '../../twmap/types'
  import { ColorEnvelope, PositionEnvelope, SoundEnvelope, EnvPoint } from '../../twmap/envelope'
  import ContextMenu from './contextMenu.svelte'
  import { onMount } from 'svelte'
  import { showInfo, showError, clearDialog } from './dialog'

  type FormEvent<T> = Event & { currentTarget: EventTarget & T }
  type InputEvent = FormEvent<HTMLInputElement>
  
  type Point = {
    x: number, y: number, curve: Info.CurveType
  }
  type ViewBox = {
    x: number,
    y: number,
    w: number,
    h: number,
  }
  
  export let rmap: RenderMap
  export let selected: Envelope | null = null
  
  let viewBox: ViewBox = { x: 0, y: 0, w: 0, h: 0 }
  let paths: Point[][] = []
  let colors: string[] = []
  let svg: SVGSVGElement
  
  type Chan = 
    'color_r' | 'color_g' | 'color_b' | 'color_a' |
    'pos_x' | 'pos_y' | 'pos_r' |
    'sound_v'
    
  // const envTypes: EnvType[] = [
  //   'invalid', 'sound', 'position', 'color'
  // ]

  const curves: CurveTypeStr[] = [
    'step',
    'linear',
    'slow',
    'fast',
    'smooth',
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
    color_r: (x: EnvPoint<any>, val: number) => x.content.r = val,
    color_g: (x: EnvPoint<any>, val: number) => x.content.g = val,
    color_b: (x: EnvPoint<any>, val: number) => x.content.b = val,
    color_a: (x: EnvPoint<any>, val: number) => x.content.a = val,
    pos_x: (x: EnvPoint<any>, val: number) => x.content.x = val,
    pos_y: (x: EnvPoint<any>, val: number) => x.content.y = val,
    pos_r: (x: EnvPoint<any>, val: number) => x.content.rotation = val,
    sound_v: (x: EnvPoint<any>, val: number) => x.content = val,
  }
  
  let lastSelected: Envelope | null = null
  
  $: if (selected && channelEnabled) {
    if (selected !== lastSelected) { // we only reset the viewbox when changing active envelope
      viewBox = makeViewBox(selected)
      lastSelected = selected
    }
    paths = makePaths(selected)
    colors = makeColors(selected)
  }
  
  $: if (!selected) {
    viewBox = { x: 0, y: 0, w: 0, h: 0 }
    paths = []
    colors = []
    lastSelected = selected
  }

  function clampI32(n: number) {
    return clamp(n, -2_147_483_648, 2_147_483_647)
  }

  function clamp(cur: number, min: number, max: number) {
    return Math.min(Math.max(min, cur), max)
  }

  function envChannels(env: Envelope) {
    if (env instanceof ColorEnvelope)
      return colorChannels
    else if (env instanceof PositionEnvelope)
      return posChannels
    else if (env instanceof SoundEnvelope)
      return soundChannels
  }

  const viewBoxMargin = 0.01 // additional space, relative to the viewbox
  
  function makeViewBox(env: Envelope | null): ViewBox {

    if (env === null || env.points.length === 0) {
      const xMargin = viewBoxMargin * 1000
      return { x: -xMargin, y: -1024, w: 1000 + 2 * xMargin, h: 2048 }
    }
  
    const allPoints = envChannels(env).map(c =>
        env.points.map((p: EnvPoint<any>) => channelVal[c](p))
    ).flat()

    let minX = -viewBoxMargin
    let maxX = Math.max(1000, env.points[env.points.length - 1].time)
    let maxY = Math.max.apply(null, allPoints.map(p => Math.abs(p)))
    let minY = -maxY
    
    if (maxY === 0) { // no point
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
  
  function makePath(env: Envelope, chan: Chan) {
    const x = env.points.map((p: EnvPoint<any>) => p.time)
    const y = env.points.map((p: EnvPoint<any>) => -channelVal[chan](p)) // notice the minus sign to flip the y axis

    return x.map((_, i) => { return { x: x[i], y: y[i], curve: env.points[i].type } })
  }
  
  function makePaths(env: Envelope) {
    return envChannels(env)
      .filter(c => channelEnabled[c])
      .map(c => makePath(env, c))
  }
  
  function makeColors(env: Envelope) {
    const colors = [ 'red', 'green', 'blue', 'orange' ]
    const channels = envChannels(env)
    const res = []

    for (const i in channels)
      if (channelEnabled[channels[i]])
        res.push(colors[i])

    return res
  }

  function pixelToSvg(x: number, y: number) {
    const rect = svg.getBoundingClientRect()
    const px = (x - rect.left) / rect.width * viewBox.w + viewBox.x
    const py = (y - rect.top) / rect.height * viewBox.h + viewBox.y
    return [ px, -py ] // notice the minus sign to flip the y axis
  }

  function viewBoxStr(viewBox: ViewBox) {
    const { x, y, w, h} = viewBox
    return `${x} ${y} ${w} ${h}`
  }
  
  function curveStr(p1: Point, p2: Point) {
    if (p1.curve === Info.CurveType.STEP) {
      return `M${p1.x},${p1.y} H${p2.x} V${p2.y}`
    }
    if (p1.curve === Info.CurveType.LINEAR) {
      return `M${p1.x},${p1.y} L${p2.x},${p2.y}`
    }
    else if (p1.curve === Info.CurveType.SLOW) {
      // x^3, bezier approx. solved by bruteforce with steps of 0.1
      let cp1 = { x: 0.6, y: 0.0 }
      let cp2 = { x: 0.8, y: 0.4 }
      cp1 = { x: p1.x + cp1.x * (p2.x - p1.x), y: p1.y + cp1.y * (p2.y - p1.y) }
      cp2 = { x: p1.x + cp2.x * (p2.x - p1.x), y: p1.y + cp2.y * (p2.y - p1.y) }
      return `M${p1.x},${p1.y} C${cp1.x},${cp1.y},${cp2.x},${cp2.y},${p2.x},${p2.y}`
    }
    else if (p1.curve === Info.CurveType.FAST) {
      // 1 - (1 - x)^3, bezier approx. solved by bruteforce with steps of 0.1
      let cp1 = { x: 0.2, y: 0.6 }
      let cp2 = { x: 0.4, y: 1.0 }
      cp1 = { x: p1.x + cp1.x * (p2.x - p1.x), y: p1.y + cp1.y * (p2.y - p1.y) }
      cp2 = { x: p1.x + cp2.x * (p2.x - p1.x), y: p1.y + cp2.y * (p2.y - p1.y) }
      return `M${p1.x},${p1.y} C${cp1.x},${cp1.y},${cp2.x},${cp2.y},${p2.x},${p2.y}`
    }
    else if (p1.curve === Info.CurveType.SMOOTH) {
      // 3x^2 - 2x^3, bezier approx. solved by bruteforce with steps of 0.1
      let cp1 = { x: 0.3, y: 0.0 }
      let cp2 = { x: 0.7, y: 1.0 }
      cp1 = { x: p1.x + cp1.x * (p2.x - p1.x), y: p1.y + cp1.y * (p2.y - p1.y) }
      cp2 = { x: p1.x + cp2.x * (p2.x - p1.x), y: p1.y + cp2.y * (p2.y - p1.y) }
      return `M${p1.x},${p1.y} C${cp1.x},${cp1.y},${cp2.x},${cp2.y},${p2.x},${p2.y}`
    }
    else { // default to linear
      return `M${p1.x},${p1.y} L${p2.x},${p2.y}`
    }
  }
  
  function pointStr(x: number, y: number) {
    return `M${x},${y} M${x},${y} Z`
  }
  
  onMount(() => {
    if (selected === null && rmap.map.envelopes.length)
      selected = rmap.map.envelopes[0]
  })

  async function onRename(e: InputEvent) {
    const change: EditEnvelope = {
      index: rmap.map.envelopes.indexOf(selected),
      name: e.currentTarget.value,
    }
    try {
      showInfo('Please wait…')
      await server.query('editenvelope', change)
      rmap.editEnvelope(change)
      rmap = rmap // hack to redraw
      clearDialog()
    } catch (e) {
      showError('Failed to rename envelope: ' + e)
    }
  }
  
  async function onNewEnv(e: FormEvent<HTMLSelectElement>) {
    const kind: 'position' | 'color' | 'sound' = e.currentTarget.value as any
    e.currentTarget.selectedIndex = 0 // reset the select to the default value
    const change: CreateEnvelope = {
      kind, name: '',
    }
    try {
      showInfo('Please wait…')
      await server.query('createenvelope', change)
      rmap.createEnvelope(change)
      selected = rmap.map.envelopes[rmap.map.envelopes.length - 1]
      rmap = rmap // hack to redraw
      clearDialog()
    } catch (e) {
      showError('Failed to create envelope: ' + e)
    }
  }
  
  async function onDelete() {
    const change: DeleteEnvelope = {
      index: rmap.map.envelopes.indexOf(selected)
    }
    try {
      showInfo('Please wait…')
      await server.query('deleteenvelope', change)
      rmap.removeEnvelope(change.index)
      selected = rmap.map.envelopes[change.index - 1] || null
      rmap = rmap // hack to redraw
      clearDialog()
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
    }
    else {
      activePath = -1
      activePoint = -1
    }
  }
  
  function onMouseUp() {
    if (activePath !== -1 && activePoint !== -1) {
      const change = makeEnvEdit()
      server.send('editenvelope', change)

      activePath = -1
      activePoint = -1
    }
  }
  
  function onMouseMove(e: MouseEvent) {
    if (activePath !== -1 && activePoint !== -1) {
      const chan = envChannels(selected)[activePath]
      const point = selected.points[activePoint]
      const prev = selected.points[Math.max(0, activePoint - 1)] 
      const next = selected.points[Math.min(selected.points.length - 1, activePoint + 1)] 
      let [ px, py ] = pixelToSvg(e.clientX, e.clientY)
      
      px = Math.max(0, px) // env times must be >= 0
      px = Math.min(Math.max(viewBox.x, px), viewBox.x + viewBox.w)
      py = Math.min(Math.max(viewBox.y, py), viewBox.y + viewBox.h)
      
      if (point !== next)
        px = Math.min(px, next.time)
      if (point !== prev)
        px = Math.max(px, prev.time)

      px = Math.floor(px)
      py = Math.floor(py)

      point.time = px
      setChannelVal[chan](point, py)

      selected = selected // hack to redraw
    }
  }
  
  function onResize() {
  }
  
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
  
  function makeEnvEdit(): EditEnvelope {
    const index = rmap.map.envelopes.indexOf(selected)

    if (selected instanceof ColorEnvelope) {
      return {
        index,
        points: {
          type: 'color',
          content: selected.points.map(envPointToJson)
        }
      }
    }
    else if (selected instanceof PositionEnvelope) {
      return {
        index,
        points: {
          type: 'position',
          content: selected.points.map(envPointToJson)
        }
      }
    }
    else if (selected instanceof SoundEnvelope) {
      return {
        index,
        points: {
          type: 'sound',
          content: selected.points.map(envPointToJson)
        }
      }
    }
    else {
      console.warn('unsupported envelope type', selected)
      return null
    }
  }
  
  function onEditValue(e: InputEvent) {
    const point = selected.points[cm_j]
    const chan = envChannels(selected)[cm_i]
    const val = clampI32(Math.floor(parseFloat(e.currentTarget.value) * 1024))

    if (isNaN(val))
      return
    
    setChannelVal[chan](point, val)
    selected = selected // hack to redraw
    
    const change = makeEnvEdit()
    server.send('editenvelope', change)
  }
  
  function onEditTime(e: InputEvent) {
    const point = selected.points[cm_j]
    const prev = selected.points[Math.max(0, cm_j - 1)] 
    const next = selected.points[Math.min(selected.points.length - 1, cm_j + 1)] 
    let val = clampI32(Math.floor(parseFloat(e.currentTarget.value) * 1000))
    
    if (isNaN(val))
      return
    
    val = Math.max(0, val) // env point time must be >= O

    if (point !== next)
      val = Math.min(val, next.time)
    if (point !== prev)
      val = Math.max(val, prev.time)

    point.time = val
    selected = selected // hack to redraw
    
    const change = makeEnvEdit()
    server.send('editenvelope', change)
  }
  
  function onDeletePoint() {
    selected.points.splice(cm_j, 1)
    cm_j = -1

    selected = selected // hack to redraw

    const change = makeEnvEdit()
    server.send('editenvelope', change)
  }
  
  function onEditCurve(e: FormEvent<HTMLSelectElement>) {
    const point = selected.points[cm_k]
    const val: Info.CurveType = clampI32(parseInt(e.currentTarget.value))
    point.type = val
    selected = selected // hack to redraw
    
    const change = makeEnvEdit()
    server.send('editenvelope', change)
  }
  
  function onMouseWheel(e: WheelEvent) {
    const direction = e.deltaY < 0 ? -1 : 1
    viewBox = scaleViewBox(viewBox, 1 + direction * 0.1)
  }
  
  function onRescale() {
    viewBox = makeViewBox(selected)
  }
  
  function addPoint(e: MouseEvent) {
    if (!(e.target instanceof SVGSVGElement) || e.button !== 0)
      return
  
    let [ px, _ ] = pixelToSvg(e.clientX, e.clientY)
    px = Math.floor(px)
    
    if (px < 0) // point time must be >= 0
      return

    let nextIndex = selected.points.findIndex((p: EnvPoint<any>) => p.time >= px)
    if (nextIndex === -1)
      nextIndex = selected.points.length
      
    else if (selected.points[nextIndex].time === px) // don't add another point on top
      return

    const newPoint: EnvPoint<any> = {
      type: Info.CurveType.LINEAR,
      time: px,
      content: selected.computePoint(px),
    }
    
    // floor channel values
    for (const chan of envChannels(selected))
      setChannelVal[chan](newPoint, Math.floor(channelVal[chan](newPoint)))

    selected.points.splice(nextIndex, 0, newPoint)
    selected = selected // hack to redraw
    
    const change = makeEnvEdit()
    server.send('editenvelope', change)
  }
  
</script>

<svelte:window on:resize={onResize} on:mousemove={onMouseMove} on:mouseup={onMouseUp} />

<div id="envelope-editor">
  <div class="header">
    {#if selected}
      <select on:change={(e) => selected = rmap.map.envelopes[e.currentTarget.value]}>
       {#each rmap.map.envelopes as env}
         {@const i = rmap.map.envelopes.indexOf(env)}
         <option selected={env === selected} value={i}>{`#${i} ${env.name || ''} (${envTypes[env.type]})`}</option>
       {/each}
      </select>
      <label><input type="text" value={selected.name} placeholder="(unnamed)" on:change={onRename}/></label>
      <div class="channels">
        {#if selected instanceof ColorEnvelope}
          <label><b style:color="red">R</b><input type="checkbox" bind:checked={channelEnabled.color_r} /></label>
          <label><b style:color="green">G</b><input type="checkbox" bind:checked={channelEnabled.color_g} /></label>
          <label><b style:color="blue">B</b><input type="checkbox" bind:checked={channelEnabled.color_b} /></label>
          <label><b style:color="orange">A</b><input type="checkbox" bind:checked={channelEnabled.color_a} /></label>
        {:else if selected instanceof PositionEnvelope}
          <label><b style:color="red">X</b><input type="checkbox" bind:checked={channelEnabled.pos_x} /></label>
          <label><b style:color="green">Y</b><input type="checkbox" bind:checked={channelEnabled.pos_y} /></label>
          <label><b style:color="blue">R</b><input type="checkbox" bind:checked={channelEnabled.pos_r} /></label>
        {:else if selected instanceof SoundEnvelope}
          <label><b style:color="red">V</b><input type="checkbox" bind:checked={channelEnabled.sound_v} /></label>
        {/if}
      </div>
      <button class="default" on:click={onRescale}>Rescale</button>
    {/if}
    <div class="buttons">
      <select on:change={onNewEnv}>
        <option selected disabled>New envelope…</option>
        <option value='color'>Color</option>
        <option value='position'>Position</option>
        <option value='sound'>Sound</option>
      </select>
      <button class="danger" on:click={onDelete} disabled={selected === null}>Delete</button>
    </div>
  </div>
  
  <div class="graph" on:wheel={onMouseWheel}>
  <svg viewBox={viewBoxStr(viewBox)} preserveAspectRatio="none" bind:this={svg} on:mousedown={addPoint}>
      {#each paths as path, i}
        {@const col = colors[i]}
        {#each path as p, k}
          {#if k !== 0}
            {@const p2 = path[k - 1]}
            <path d={curveStr(p2, p)} style:stroke={col}
              on:contextmenu={(e) => showCM(e, i, -1, k - 1)}></path>
          {/if}
        {/each}
        {#each path as p, j}
          <!-- not using the circle becausePointthe path stroke can be screen-space sized but not the circle fill. -->
          <path class="point" d={pointStr(p.x, p.y)} style:stroke={col}
            on:mousedown={(e) => onMouseDown(e, i, j)} on:contextmenu={(e) => showCM(e, i, j, -1)}></path>
        {/each}
      {/each}
      <line x1={viewBox.x} y1={0} x2={viewBox.x + viewBox.w} y2={0} class="axis"></line> <!-- the y=0 line -->
      {#each Array.from({ length: Math.ceil(viewBox.w / 1000) }) as _, i}
        <line x1={i * 1000} y1={viewBox.y} x2={i * 1000} y2={viewBox.y + viewBox.h} class="axis"></line> <!-- the x=i line -->
      {/each}
    </svg>
  </div>
</div>
          
{#if cm_i !== -1 && cm_j !== -1}
  {@const p = paths[cm_i][cm_j]}
  <ContextMenu x={cm_x} y={cm_y} on:close={hideCM}>
    <div class="edit-env-point">
      <label>Time <input type="number" min={0} value={p.x / 1000} on:change={onEditTime} /></label>
      <label>Value <input type="number" value={-p.y / 1024} on:change={onEditValue} /></label>
      <button on:click={onDeletePoint}>Delete</button>
    </div>
  </ContextMenu>
{:else if cm_i !== -1 && cm_k !== -1}
  {@const p = paths[cm_i][cm_k]}
  <ContextMenu x={cm_x} y={cm_y} on:close={hideCM}>
    <div class="edit-env-point">
      <label>Curve <select on:change={onEditCurve}>
        {#each curves as c, i}
          <option value={i} selected={i === p.curve}>{c}</option>
        {/each}
      </select></label>
    </div>
  </ContextMenu>
{/if}
