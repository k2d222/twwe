<script lang="ts">
  import type { RenderMap } from '../../gl/renderMap'
  import type { QuadsLayer } from '../../twmap/quadsLayer'
  import type { Coord } from '../../twmap/types'
  import { viewport } from '../../gl/global'
  import { onMount, onDestroy } from 'svelte'

  export let rmap: RenderMap
  export let layer: QuadsLayer
  
  let viewBox: string

  function quadPoints(points: Coord[]) {
    const toStr = (p: Coord) => p.x / 1024 + ',' + p.y / 1024
    const topLeft = points[0]
    const topRight = points[1]
    const bottomLeft = points[2]
    const bottomRight = points[3]
    return [toStr(topLeft), toStr(topRight), toStr(bottomRight), toStr(bottomLeft)].join(' ')
  }

  function makeViewBox() {
    const { x1, y1, x2, y2 } = viewport.screen()
    return [x1, y1, x2 - x1, y2 - y1].map(x => x * 32).join(' ')
  }
  
  let destroyed = false
  
  onMount(() => {
    const updateForever = () => {
      viewBox = makeViewBox()
      if (!destroyed)
        requestAnimationFrame(updateForever)
    }
    updateForever()
    
  })

  onDestroy(() => {
    destroyed = true
  })
</script>

<div id="edit-quads">
  {#each layer.quads as quad}
    <svg {viewBox} xmlns="http://www.w3.org/2000/svg">
      <polygon points={quadPoints(quad.points)} />
      <circle cx={quad.points[0].x / 1024} cy={quad.points[0].y / 1024} r={5} />
      <circle cx={quad.points[1].x / 1024} cy={quad.points[1].y / 1024} r={5} />
      <circle cx={quad.points[2].x / 1024} cy={quad.points[2].y / 1024} r={5} />
      <circle cx={quad.points[3].x / 1024} cy={quad.points[3].y / 1024} r={5} />
      <circle cx={quad.points[4].x / 1024} cy={quad.points[4].y / 1024} r={5} class="center" />
    </svg>
  {/each}
</div>