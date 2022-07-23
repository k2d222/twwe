<script lang="ts">
  import type * as Info from '../../twmap/types'
  import type { Color } from '../../twmap/types'
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher()

  export let quad: Info.Quad
  export let p: number

  $: point = quad.points[p]

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
    <button on:click={onDelete}>Delete Quad</button>
  {/if}
</div>
