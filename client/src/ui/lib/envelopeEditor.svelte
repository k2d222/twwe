<script lang="ts">
  import type { Envelope } from '../../twmap/map'
  import type { RenderMap } from '../../gl/renderMap'
  import { CurveType } from '../../twmap/types'
  import { ColorEnvelope, PositionEnvelope, SoundEnvelope, EnvPoint } from '../../twmap/envelope'
  import ContextMenu from './contextMenu.svelte'
  import { onMount } from 'svelte'

  type FormEvent<T> = Event & { currentTarget: EventTarget & T }
  type InputEvent = FormEvent<HTMLInputElement>
  
  type Point = {
    x: number, y: number, curve: CurveType
  }
  type ViewBox = {
    x: number,
    y: number,
    w: number,
    h: number,
  }
  
  export let rmap: RenderMap
  export let visible: boolean = false
  export let selected: Envelope | null = null
  
  let viewBox: ViewBox = { x: 0, y: 0, w: 0, h: 0 }
  let paths: Point[][] = []
  let colors: string[] = []
  let svg: SVGSVGElement
  
  type Chan = 
    'color_r' | 'color_g' | 'color_b' | 'color_a' |
    'pos_x' | 'pos_y' | 'pos_r' |
    'sound_v'

  const curves = [
    {
      type: CurveType.STEP,
      name: 'step'
    }, {
      type: CurveType.LINEAR,
      name: 'linear'
    }, {
      type: CurveType.SLOW,
      name: 'slow'
    }, {
      type: CurveType.FAST,
      name: 'fast'
    }, {
      type: CurveType.SMOOTH,
      name: 'smooth'
    }
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
    pos_r: (x: EnvPoint<any>) => x.content.r,
    sound_v: (x: EnvPoint<any>) => x.content,
  }

  let setChannelVal: { [k in Chan]: (x: EnvPoint<any>, val: number) => void } = {
    color_r: (x: EnvPoint<any>, val: number) => x.content.r = val,
    color_g: (x: EnvPoint<any>, val: number) => x.content.g = val,
    color_b: (x: EnvPoint<any>, val: number) => x.content.b = val,
    color_a: (x: EnvPoint<any>, val: number) => x.content.a = val,
    pos_x: (x: EnvPoint<any>, val: number) => x.content.x = val,
    pos_y: (x: EnvPoint<any>, val: number) => x.content.y = val,
    pos_r: (x: EnvPoint<any>, val: number) => x.content.r = val,
    sound_v: (x: EnvPoint<any>, val: number) => x.content = val,
  }
  
  $: if (selected && channelEnabled) {
    viewBox = makeViewBox(selected)
    paths = makePaths(selected)
    colors = makeColors(selected)
  }


  function envChannels(env: Envelope) {
    if (env instanceof ColorEnvelope)
      return colorChannels
    else if (env instanceof PositionEnvelope)
      return posChannels
    else if (env instanceof SoundEnvelope)
      return soundChannels
  }

  function makeViewBox(env: Envelope): ViewBox {
    const allPoints = envChannels(env).map(c =>
        env.points.map((p: EnvPoint<any>) => channelVal[c](p))
    ).flat()

    let minX = env.points[0].time
    let maxX = env.points[env.points.length - 1].time
    let maxY = Math.max.apply(null, allPoints.map(p => Math.abs(p)))
    let minY = -maxY

    const paddingX = (maxX - minX) * .01
    const paddingY = (maxY - minY) * .01
    minX -= paddingX
    maxX += paddingX
    minY -= paddingY
    maxY += paddingY

    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }

  function makePath(env: Envelope, chan: Chan) {
    const x = env.points.map((p: EnvPoint<any>) => p.time)
    const y = env.points.map((p: EnvPoint<any>) => -channelVal[chan](p)) // notice the minus sign to flip the y axis

    return x.map((_, i) => { return { x: x[i], y: y[i], curve: env.points[i].curve } })
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
    if (p1.curve === CurveType.STEP) {
      return `M${p1.x},${p1.y} H${p2.x} V${p2.y}`
    }
    if (p1.curve === CurveType.LINEAR) {
      return `M${p1.x},${p1.y} L${p2.x},${p2.y}`
    }
    else if (p1.curve === CurveType.SLOW) {
      // x^3, bezier approx. solved by bruteforce with steps of 0.1
      let cp1 = { x: 0.6, y: 0.0 }
      let cp2 = { x: 0.8, y: 0.4 }
      cp1 = { x: p1.x + cp1.x * (p2.x - p1.x), y: p1.y + cp1.y * (p2.y - p1.y) }
      cp2 = { x: p1.x + cp2.x * (p2.x - p1.x), y: p1.y + cp2.y * (p2.y - p1.y) }
      return `M${p1.x},${p1.y} C${cp1.x},${cp1.y},${cp2.x},${cp2.y},${p2.x},${p2.y}`
    }
    else if (p1.curve === CurveType.FAST) {
      // 1 - (1 - x)^3, bezier approx. solved by bruteforce with steps of 0.1
      let cp1 = { x: 0.2, y: 0.6 }
      let cp2 = { x: 0.4, y: 1.0 }
      cp1 = { x: p1.x + cp1.x * (p2.x - p1.x), y: p1.y + cp1.y * (p2.y - p1.y) }
      cp2 = { x: p1.x + cp2.x * (p2.x - p1.x), y: p1.y + cp2.y * (p2.y - p1.y) }
      return `M${p1.x},${p1.y} C${cp1.x},${cp1.y},${cp2.x},${cp2.y},${p2.x},${p2.y}`
    }
    else if (p1.curve === CurveType.SMOOTH) {
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
  
  function pathStr(path: Point[]) {
    let str = `M${path[0].x},${path[0].y}`
    
    for (let i = 1; i < path.length; i++) {
      str += ` L${path[i].x},${path[i].y}`
    }
    
    return str
  }
  
  function pointStr(x: number, y: number) {
    return `M${x},${y} M${x},${y} Z`
  }
  
  onMount(() => {
    if (selected === null && rmap.map.envelopes.length)
      selected = rmap.map.envelopes[0]
  })

  function onRename(e: InputEvent) {
    console.log("rename", e.currentTarget.value)
  }
  
  function onNewEnv(e: FormEvent<HTMLSelectElement>) {
    e.currentTarget.selectedIndex = 0
  }
  
  function onDelete() {
    if (selected) {
      console.log("delete")
    }
  }
  
  let activePath = -1
  let activePoint = -1
  
  function onMouseDown(i: number, j: number) {
    activePath = i
    activePoint = j
  }
  
  function onMouseUp() {
    activePath = -1
    activePoint = -1
  }
  
  function onMouseMove(e: MouseEvent) {
    if (activePath !== -1 && activePoint !== -1) {
      const chan = envChannels(selected)[activePath]
      const point = selected.points[activePoint]
      const prev = selected.points[Math.max(0, activePoint - 1)] 
      const next = selected.points[Math.min(selected.points.length - 1, activePoint + 1)] 
      let [ px, py ] = pixelToSvg(e.clientX, e.clientY)
      
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
  
</script>

<svelte:window on:resize={onResize} on:mousemove={onMouseMove} on:mouseup={onMouseUp} />

<div id="envelope-editor" class:hidden={!visible}>
  <div class="header">
    <select on:change={(e) => selected = rmap.map.envelopes[e.currentTarget.value]}>
     {#each rmap.map.envelopes as env}
       {@const i = rmap.map.envelopes.indexOf(env)}
       <option value={i}>{'#' + i + ' ' + (env.name || '(unnamed)')}</option>
     {/each}
    </select>
    {#if selected}
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
          Sound envelope not supported yet.
        {/if}
      </div>
    {/if}
    <div class="buttons">
      <select on:change={onNewEnv}>
        <option selected disabled>New…</option>
        <option>Color</option>
        <option>Position</option>
        <option>Sound</option>
      </select>
      <button on:click={onDelete} disabled={selected === null}>Delete</button>
    </div>
  </div>
  
  <div class="graph">
    <svg viewBox={viewBoxStr(viewBox)} preserveAspectRatio="none" bind:this={svg}>
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
            on:mousedown={() => onMouseDown(i, j)} on:contextmenu={(e) => showCM(e, i, j, -1)}></path>
        {/each}
      {/each}
      <line x1={viewBox.x} y1={0} x2={viewBox.x + viewBox.w} y2={0} class="axis"></line> <!-- the x=0 line -->
      <line x1={viewBox.x} y1={1024} x2={viewBox.x + viewBox.w} y2={1024} class="axis"></line> <!-- the x=1 line -->
      <line x1={viewBox.x} y1={-1024} x2={viewBox.x + viewBox.w} y2={-1024} class="axis"></line> <!-- the x=-1 line -->
      <line x1={0} y1={viewBox.y} x2={0} y2={viewBox.y + viewBox.h} class="axis"></line> <!-- the y=0 line -->
      <line x1={1000} y1={viewBox.y} x2={1000} y2={viewBox.y + viewBox.h} class="axis"></line> <!-- the y=1 line -->
      <line x1={-1000} y1={viewBox.y} x2={-1000} y2={viewBox.y + viewBox.h} class="axis"></line> <!-- the y=-1 line -->
    </svg>
  </div>
</div>
          
{#if cm_i !== -1 && cm_j !== -1}
  {@const p = paths[cm_i][cm_j]}
  <ContextMenu x={cm_x} y={cm_y} on:close={hideCM}>
    <div class="edit-env-point">
      <label>Time <input type="number" value={p.x / 1000} /></label>
      <label>Value <input type="number" value={-p.y / 1024} /></label>
    </div>
  </ContextMenu>
{:else if cm_i !== -1 && cm_k !== -1}
  {@const p = paths[cm_i][cm_k]}
  <ContextMenu x={cm_x} y={cm_y} on:close={hideCM}>
    <div class="edit-env-point">
      <label>Curve <select>
        {#each curves as c}
          <option selected={c.type === p.curve}>{c.name}</option>
        {/each}
      </select></label>
    </div>
  </ContextMenu>
{/if}
