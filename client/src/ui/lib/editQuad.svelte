<script lang="ts">
  import type { Color } from '../../twmap/types'
  import type { Quad } from '../../twmap/quadsLayer'
  import type { RenderMap } from '../../gl/renderMap'
  import { ColorEnvelope, PositionEnvelope } from '../../twmap/envelope'
  import { createEventDispatcher } from 'svelte'

  type FormEvent<T> = Event & { currentTarget: EventTarget & T }
  type FormInputEvent = FormEvent<HTMLInputElement>

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

  function parseI32(str: string) {
    return clamp(parseInt(str), -2_147_483_648, 2_147_483_647)
  }

  function clamp(cur: number, min: number, max: number) {
    return Math.min(Math.max(min, cur), max)
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

  function onEditPosX(e: FormInputEvent) {
    const x = Math.floor(parseFloat(e.currentTarget.value) * 1024)
    console.log(e.currentTarget.value)
    if (!isNaN(x)) {
      quad.points[p].x = x
      dispatch('change')
    }
  }

  function onEditPosY(e: FormInputEvent) {
    const y = Math.floor(parseFloat(e.currentTarget.value) * 1024)
    if (!isNaN(y)) {
      quad.points[p].y = y
      dispatch('change')
    }
  }

  function onEditColor(e: FormInputEvent) {
    const color = strToColor(e.currentTarget.value, quad.colors[p].a)
    quad.colors[p] = color
    dispatch('change')
  }

  function onEditOpacity(e: FormInputEvent) {
    quad.colors[p].a = clamp(parseInt(e.currentTarget.value), 0, 255)
    dispatch('change')
  }

  function onDelete() {
    dispatch('delete')
  }

  function onDuplicate() {
    dispatch('duplicate')
  }

  function onEditColEnv(e: FormEvent<HTMLSelectElement>) {
    quad.colorEnv = rmap.map.envelopes[parseInt(e.currentTarget.value)] as ColorEnvelope
    dispatch('change')
  }

  function onEditColEnvOff(e: FormInputEvent) {
    const colorEnvOffset = parseI32(e.currentTarget.value)
    if (!isNaN(colorEnvOffset)) {
      quad.colorEnvOffset = colorEnvOffset
      dispatch('change')
    }
  }

  function onEditPosEnv(e: FormEvent<HTMLSelectElement>) {
    quad.posEnv = rmap.map.envelopes[parseInt(e.currentTarget.value)] as PositionEnvelope
    dispatch('change')
  }

  function onEditPosEnvOff(e: FormInputEvent) {
    const posEnvOffset = parseInt(e.currentTarget.value)
    if (!isNaN(posEnvOffset)) {
      quad.posEnvOffset = posEnvOffset
      dispatch('change')
    }
  }

  function onRecenter() {
    const corners = quad.points.filter((_, i) => i !== 4)
    const centerX = corners.map(p => p.x).reduce((acc, x) => acc + x) / 4
    const centerY = corners.map(p => p.y).reduce((acc, y) => acc + y) / 4
    quad.points[4].x = Math.round(centerX)
    quad.points[4].y = Math.round(centerY)
    dispatch('change')
  }
</script>

<div class="edit-quad">
  <span>Quad {pointName(p)}</span>
  <label>
    Pos X <input type="number" value={Math.floor(point.x / 1024)} on:change={onEditPosX} />
  </label>
  <label>
    Pos Y <input type="number" value={Math.floor(point.y / 1024)} on:change={onEditPosY} />
  </label>
  {#if p !== 4}
    {@const col = quad.colors[p]}
    <label>
      Color <input type="color" value={colorToStr(col)} on:change={onEditColor} />
    </label>
    <label>
      Opacity <input type="range" min={0} max={255} value={col.a} on:change={onEditOpacity} />
    </label>
  {:else}
    <label>
      Position Envelope <select on:change={onEditPosEnv}>
        <option selected={quad.posEnv === null} value={-1}>None</option>
        {#each positionEnvelopes as env}
          {@const i = rmap.map.envelopes.indexOf(env)}
          <option selected={quad.posEnv === env} value={i}>
            {'#' + i + ' ' + (env.name || '(unnamed)')}
          </option>
        {/each}
      </select>
    </label>
    <label>
      Position Env. Offset <input
        type="number"
        value={quad.posEnvOffset}
        on:change={onEditPosEnvOff}
      />
    </label>
    <label>
      Color Env. <select on:change={onEditColEnv}>
        <option selected={quad.colorEnv === null} value={-1}>None</option>
        {#each colorEnvelopes as env}
          {@const i = rmap.map.envelopes.indexOf(env)}
          <option selected={quad.colorEnv === env} value={i}>
            {'#' + i + ' ' + (env.name || '(unnamed)')}
          </option>
        {/each}
      </select>
    </label>
    <label>
      Color Env. Offset <input
        type="number"
        value={quad.colorEnvOffset}
        on:change={onEditColEnvOff}
      />
    </label>
    <button class="default" on:click={onRecenter}>Recenter</button>
    <button class="default" on:click={onDuplicate}>Duplicate</button>
    <button class="danger" on:click={onDelete}>Delete</button>
  {/if}
</div>
