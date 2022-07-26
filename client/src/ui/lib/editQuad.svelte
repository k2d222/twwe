<script lang="ts">
  import type { Color } from '../../twmap/types'
  import type { Quad } from '../../twmap/quadsLayer'
  import { ColorEnvelope, PositionEnvelope } from '../../twmap/envelope'
  import { RenderMap } from '../../gl/renderMap'
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher()

  export let rmap: RenderMap
  export let quad: Quad
  export let p: number

  $: point = quad.points[p]
  $: colorEnvelopes = rmap.map.envelopes.filter(e => e instanceof ColorEnvelope)
  $: positionEnvelopes = rmap.map.envelopes.filter(e => e instanceof PositionEnvelope)

  function pointName(p: number) {
    if (p === 0) return 'Top Left'
    else if (p === 1) return 'Top Right'
    else if (p === 2) return 'Bottom Left'
    else if (p === 3) return 'Bottom Right'
    else return 'Center'
  }

  function intVal(target: EventTarget) {
    return parseInt((target as HTMLInputElement).value)
  }

  function strVal(target: EventTarget) {
    return (target as HTMLInputElement).value
  }

  function colorToStr(c: Color) {
    let hex = (i: number) => ('0' + i.toString(16)).slice(-2)
    return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`
  }

  function strToColor(rgb: string, a: number) {
    return {
      r: parseInt(rgb.slice(1, 3), 16),
      g: parseInt(rgb.slice(3, 5), 16),
      b: parseInt(rgb.slice(5, 7), 16),
      a,
    }
  }

  function onEditPos(x: number, y: number) {
    const points = quad.points[p]
    points.x = Math.floor(x)
    points.y = Math.floor(y)
    dispatch('change')
  }

  function onEditColor(rgb: string) {
    const color = strToColor(rgb, quad.colors[p].a)
    quad.colors[p] = color
    dispatch('change')
  }

  function onEditOpacity(a: number) {
    quad.colors[p].a = a
    dispatch('change')
  }

  function onDelete() {
    dispatch('delete')
  }

  function onDuplicate() {
    dispatch('duplicate')
  }
  
  function onEditColEnv(env: number) {
    quad.colorEnv = rmap.map.envelopes[env] as ColorEnvelope
    dispatch('change')
  }

  function onEditColEnvOff(off: number) {
    quad.colorEnvOffset = off
    dispatch('change')
  }
  
  function onEditPosEnv(env: number) {
    quad.posEnv = rmap.map.envelopes[env] as PositionEnvelope
    dispatch('change')
  }

  function onEditPosEnvOff(off: number) {
    quad.posEnvOffset = off
    dispatch('change')
  }

</script>

<div class="edit-quad">
  <span>Quad {pointName(p)}</span>
  <label>Pos X <input type="number" value={Math.floor(point.x / 1024)}
    on:change={(e) =>  onEditPos(intVal(e.target) * 1024, point.y)}></label>
  <label>Pos Y <input type="number" value={Math.floor(point.y / 1024)}
    on:change={(e) =>  onEditPos(point.x, intVal(e.target) * 1024)}></label>
  {#if p !== 4}
    {@const col = quad.colors[p]}
    <label>Color <input type="color" value={colorToStr(col)}
      on:change={(e) => onEditColor(strVal(e.target))}></label>
    <label>Opacity <input type="range" min={0} max={255} value={col.a}
      on:change={(e) => onEditOpacity(intVal(e.target))}></label>
  {:else}
    <label>Position Envelope <select on:change={(e) => onEditPosEnv(intVal(e.target))}>
      <option selected={quad.posEnv === null} value={-1}>None</option>
      {#each positionEnvelopes as env}
        {@const i = rmap.map.envelopes.indexOf(env)}
        <option selected={quad.posEnv === env} value={i}>{'#' + i + ' ' + (env.name || '(unnamed)')}</option>
      {/each}
    </select></label>
    <label>Position Envelope  Offset <input type="number" value={quad.posEnvOffset}
      on:change={(e) => onEditPosEnvOff(intVal(e.target))}></label>
    <label>Color Env. <select on:change={(e) => onEditColEnv(intVal(e.target))}>
      <option selected={quad.colorEnv === null} value={-1}>None</option>
      {#each colorEnvelopes as env}
        {@const i = rmap.map.envelopes.indexOf(env)}
        <option selected={quad.colorEnv === env} value={i}>{'#' + i + ' ' + (env.name || '(unnamed)')}</option>
      {/each}
    </select></label>
    <label>Color Env. Offset <input type="number" value={quad.colorEnvOffset}
      on:change={(e) => onEditColEnvOff(intVal(e.target))}></label>
    <button on:click={onDuplicate}>Duplicate</button>
    <button on:click={onDelete}>Delete</button>
  {/if}
</div>
