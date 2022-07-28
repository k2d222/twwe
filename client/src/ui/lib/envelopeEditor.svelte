<script lang="ts">
  import { ColorEnvelope, PositionEnvelope, SoundEnvelope, EnvPoint } from '../../twmap/envelope'
  import type { Envelope } from '../../twmap/map'
  import type { RenderMap } from '../../gl/renderMap'
  import { onMount } from 'svelte'

  type FormEvent<T> = Event & { currentTarget: EventTarget & T }
  type InputEvent = FormEvent<HTMLInputElement>
  
  type Point = {
    x: number, y: number
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
  let svg: SVGSVGElement
  let colors = [ 'red', 'green', 'blue', 'orange' ]
  
  type Chan = 
    'color_r' | 'color_g' | 'color_b' | 'color_a' |
    'pos_x' | 'pos_y' | 'pos_r' |
    'sound_v'

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
    let minX = env.points[0].time
    let maxX = env.points[env.points.length - 1].time
    const paddingX = (maxX - minX) * .01
    minX -= paddingX
    maxX += paddingX
    const allPoints = envChannels(env).map(c =>
        env.points.map((p: EnvPoint<any>) => channelVal[c](p))
    ).flat()
    const maxY = Math.max.apply(null, allPoints.map(p => Math.abs(p))) + 100
    const minY = -maxY
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }

  function makePath(env: Envelope, chan: Chan) {
    const x = env.points.map((p: EnvPoint<any>) => p.time)
    const y = env.points.map((p: EnvPoint<any>) => channelVal[chan](p))

    return x.map((_, i) => { return { x: x[i], y: y[i] } })
  }
  
  function makePaths(env: Envelope) {
    return envChannels(env)
      .filter(c => channelEnabled[c])
      .map(c => makePath(env, c))
  }

  function pixelToSvg(x: number, y: number) {
    const rect = svg.getBoundingClientRect()
    const px = (x - rect.left) / rect.width * viewBox.w + viewBox.x
    const py = (y - rect.top) / rect.height * viewBox.h + viewBox.y
    return [ px, py ]
  }

  function viewBoxStr(viewBox: ViewBox) {
    const { x, y, w, h} = viewBox
    return `${x} ${y} ${w} ${h}`
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

      point.time = px
      setChannelVal[chan](point, py)

      selected = selected // hack to redraw
    }
  }
  
  function onResize() {
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
          <label><b style:color={colors[0]}>R</b><input type="checkbox" bind:checked={channelEnabled.color_r} /></label>
          <label><b style:color={colors[1]}>G</b><input type="checkbox" bind:checked={channelEnabled.color_g} /></label>
          <label><b style:color={colors[2]}>B</b><input type="checkbox" bind:checked={channelEnabled.color_b} /></label>
          <label><b style:color={colors[3]}>A</b><input type="checkbox" bind:checked={channelEnabled.color_a} /></label>
        {:else if selected instanceof PositionEnvelope}
          <label><b style:color={colors[0]}>X</b><input type="checkbox" bind:checked={channelEnabled.pos_x} /></label>
          <label><b style:color={colors[1]}>Y</b><input type="checkbox" bind:checked={channelEnabled.pos_y} /></label>
          <label><b style:color={colors[2]}>R</b><input type="checkbox" bind:checked={channelEnabled.pos_r} /></label>
        {:else if selected instanceof SoundEnvelope}
          Sound envelope not supported yet.
        {/if}
      </div>
    {/if}
    <div>
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
        <path d={pathStr(path)} style:stroke={col}></path>
        {#each path as p, j}
          <!-- not using the circle becausePointthe path stroke can be screen-space sized but not the circle fill. -->
          <path class="point" d={pointStr(p.x, p.y)} style:stroke={col}
            on:mousedown={() => onMouseDown(i, j)}></path>
        {/each}
      {/each}
    </svg>
  </div>
</div>
