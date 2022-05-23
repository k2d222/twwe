<script lang="ts">
import { Image } from '../twmap/image'

export let image: Image | null
export let selected = 0

function getImgURL(image: Image) {
  if (image.img !== null) {
    return image.img.src
  }
  else if (image.data instanceof ImageData) {
    const canvas = document.createElement('canvas')
    canvas.width = image.data.width
    canvas.height = image.data.height
    const ctx = canvas.getContext('2d')
    ctx.putImageData(image.data, 0, 0)
    return canvas.toDataURL()
  }
  else {
    console.warn('unsupported image data type:', image)
    return ""
  }
}

let tiles
$: url = getImgUrl(image)

</script>

<div id="tile-selector" bind:this={cont}>
  <div class="tiles" bind:this={tiles}>
    {#each Array(tileCount) as _, i}
      {#each Array(tileCount) as _, j}
        <button
          on:click={() => selected = i * tileCount + j}
          style="
            background-image: url('{url}');
            background-position-x: -{i}00%;
            background-position-y: -{j}00%
        "></button>
      {/each}
    {/each}
  </div>
  <div class="tile selected"></div>
</div>
