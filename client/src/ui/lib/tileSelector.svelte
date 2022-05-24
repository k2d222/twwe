<script lang="ts">
import { Image } from '../../twmap/image'

export let image: Image | null
export let selected = 0

let visible = false
const tileCount = 16

let url

$: if(image) url = getImgURL(image)

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

function buttonStyle(url: string, id: number) {
  const row = Math.floor(id / tileCount)
  const col = id % tileCount
  return `
    background-image: url('${url}');
    background-position-x: -${col}00%;
    background-position-y: -${row}00%
  `
}

$: buttonStyles = Array.from({length: tileCount * tileCount}, (_, i) => buttonStyle(url, i))

function onTileClick(id: number) {
  selected = id
  visible = false
}

</script>

<div id="tile-selector">
  <div class="tiles" class:hidden={!visible}>
    {#each buttonStyles as style, i}
      <button
        on:click={() => onTileClick(i)}
        style={style}></button>
    {/each}
  </div>
  <div class="tile selected">
    <button
      on:click={() => visible = !visible}
      style={buttonStyles[selected]}></button>
  </div>
</div>
