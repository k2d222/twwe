<script lang="ts">
  import { ColorEnvelope, PositionEnvelope, SoundEnvelope, EnvPoint } from '../../twmap/envelope'
  import type { Envelope } from '../../twmap/map'
  import type { RenderMap } from '../../gl/renderMap'
  import { onMount } from 'svelte'
  type FormEvent<T> = Event & { currentTarget: EventTarget & T }
  type InputEvent = FormEvent<HTMLInputElement>

  export let rmap: RenderMap
  export let visible: boolean = false
  export let selected: Envelope | null = null
  
  let viewBox = ""
  let paths: string[] = []
  let points: string[][] = []
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
  
  $: if (selected && channelEnabled) {
    viewBox = makeViewBox(selected)
    paths = makePaths(selected)
    points = makeAllPoints(selected)
  }

  function envChannels(env: Envelope) {
    if (env instanceof ColorEnvelope)
      return colorChannels
    else if (env instanceof PositionEnvelope)
      return posChannels
    else if (env instanceof SoundEnvelope)
      return soundChannels
  }

  function makeViewBox(env: Envelope) {
    const minX = env.points[0].time
    const maxX = env.points[env.points.length - 1].time
    const allPoints = envChannels(env).map(c =>
        env.points.map((p: EnvPoint<any>) => channelVal[c](p))
    ).flat()
    const maxY = Math.max.apply(null, allPoints.map(p => Math.abs(p))) + 100
    const minY = -maxY
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`
  }
  
  function makePath(env: Envelope, chan: Chan) {
    const x = env.points.map((p: EnvPoint<any>) => p.time)
    const y = env.points.map((p: EnvPoint<any>) => channelVal[chan](p))
    let path = `M${x[0]},${y[0]}`
    
    for (let i = 1; i < x.length; i++) {
      path += ` L${x[i]},${y[i]}`
    }
    
    return path
  }
  
  function makePaths(env: Envelope) {
    return envChannels(env)
      .filter(c => channelEnabled[c])
      .map(c => makePath(env, c))
  }

  function pathPoint(x: number, y: number) {
    return `M${x},${y} M${x},${y} Z`
  }
  
  function makePoints(env: Envelope, chan: Chan) {
    const x = env.points.map((p: EnvPoint<any>) => p.time)
    const y = env.points.map((p: EnvPoint<any>) => channelVal[chan](p))
    
    return x.map((_, i) => pathPoint(x[i], y[i]))
  }

  function makeAllPoints(env: Envelope) {
    return envChannels(env)
      .filter(c => channelEnabled[c])
      .map(c => makePoints(env, c))
  }

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
  
  onMount(() => {
    if (selected === null && rmap.map.envelopes.length)
      selected = rmap.map.envelopes[0]
  })
  
</script>

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
    <svg viewBox={viewBox} preserveAspectRatio="none">
      {#each paths as d, i}
        {@const col = colors[i]}
        <path {d} style:stroke={col}></path>
        {#each points[i] as d}
          <!-- not using the circle because the path stroke can be screen-space sized but not the circle fill. -->
          <path class="point" {d} style:stroke={col}></path>
        {/each}
      {/each}
    </svg>
  </div>
</div>
