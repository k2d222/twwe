<script lang="ts">
  import { setContext, type Context } from '../../gl/global'
  import { onDestroy, onMount } from 'svelte'
  import { RenderQuadsLayer } from '../../gl/renderQuadsLayer'
  import { RenderMap } from '../../gl/renderMap'
  import type { Map } from '../../twmap/map'
  import { Renderer } from '../../gl/renderer'
  import { Viewport } from '../../gl/viewport'

  export let map: Map
  export let anim = false
  export const getRenderMap = () => rmap

  let cont: HTMLElement
  let canvas: HTMLCanvasElement
  let viewport: Viewport
  let renderer: Renderer
  let rmap: RenderMap
  let ctx: Context

  let time = 0
  let animTime = 0

  let destroyed = false

  let resized = false
  let resizeObserver = new ResizeObserver(() => {
    resized = true
  })

  onMount(() => {
    canvas.width = canvas.clientWidth
    canvas.height = canvas.clientHeight
    resizeObserver.observe(canvas)

    renderer = new Renderer(canvas)
    viewport = new Viewport(cont, canvas)
    ctx = { renderer, viewport }
    setContext(ctx)
    rmap = new RenderMap(map)

    renderLoop(0)
  })

  onDestroy(() => {
    destroyed = true
    resizeObserver.disconnect()
  })

  function renderLoop(t: DOMHighResTimeStamp) {
    if (destroyed) return

    if (resized) {
      canvas.width = canvas.clientWidth
      canvas.height = canvas.clientHeight
      resized = false
    }

    setContext(ctx)

    if (anim) {
      animTime += t - time
      updateEnvelopes(animTime)
    }

    renderer.render(viewport, rmap)

    time = t

    requestAnimationFrame(renderLoop)
  }

  function updateEnvelopes(t: number) {
    for (let env of rmap.map.envelopes) {
      env.update(t)
    }
    for (const rgroup of rmap.groups) {
      for (const rlayer of rgroup.layers) {
        if (rlayer instanceof RenderQuadsLayer) {
          rlayer.recomputeEnvelope() // COMBAK: maybe better perfs?
        }
      }
    }
  }
</script>

<div class="map-view" tabindex="-1" bind:this={cont}>
  <canvas bind:this={canvas}></canvas>
  <slot></slot>
</div>
