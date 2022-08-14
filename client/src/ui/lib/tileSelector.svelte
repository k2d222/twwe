<script lang="ts">
import type { Image } from '../../twmap/image'
import type { RenderLayer } from '../../gl/renderLayer'
import type { EditTileParams } from 'src/server/protocol'
import { TileFlags, Tile, Tele, Switch, Speedup, Tune, Coord } from '../../twmap/types'
import { TilesLayer, GameLayer, FrontLayer, TeleLayer, SwitchLayer, SpeedupLayer, TuneLayer } from '../../twmap/tilesLayer'

type Range = {
  start: Coord,
  end: Coord,
}

const tileCount = 16

export let rlayer: RenderLayer
export let tilesVisible = false
export let settingsVisible = false
export let selected: EditTileParams[][]

// inclusive range
let selection: Range = {
  start: { x: 0, y: 0 },
  end: { x: 0, y: 0 },
}

// this is a bit monolithic but hey typescript
let currentTile:    { type: 'tile'    } & Tile    = { type: 'tile',    ...TilesLayer.defaultTile()   }
let currentGame:    { type: 'tile'    } & Tile    = { type: 'tile',    ...GameLayer.defaultTile()    }
let currentFront:   { type: 'tile'    } & Tile    = { type: 'tile',    ...FrontLayer.defaultTile()   }
let currentTele:    { type: 'tele'    } & Tele    = { type: 'tele',    ...TeleLayer.defaultTile()    }
let currentSwitch:  { type: 'switch'  } & Switch  = { type: 'switch',  ...SwitchLayer.defaultTile()  }
let currentSpeedup: { type: 'speedup' } & Speedup = { type: 'speedup', ...SpeedupLayer.defaultTile() }
let currentTune:    { type: 'tune'    } & Tune    = { type: 'tune',    ...TuneLayer.defaultTile()    }

$: currentTele.number      = minmax(0, currentTele.number,      255)
$: currentSwitch.delay     = minmax(0, currentSwitch.delay,     255)
$: currentSwitch.number    = minmax(0, currentSwitch.number,    255)
$: currentSpeedup.angle    = minmax(0, currentSpeedup.angle,    359)
$: currentSpeedup.maxSpeed = minmax(0, currentSpeedup.maxSpeed, 255)
$: currentSpeedup.force    = minmax(0, currentSpeedup.force,    255)
$: currentTune.number      = minmax(0, currentTune.number,      255)

let current: EditTileParams
let boxSelect = false

$: {
  if (tilesVisible)
    settingsVisible = false
  else if (settingsVisible)
    tilesVisible = false
}

$: url = getImgURL(rlayer.texture.image)

$: current =
  rlayer.layer instanceof TilesLayer ? currentTile :
  rlayer.layer instanceof GameLayer ? currentGame :
  rlayer.layer instanceof FrontLayer ? currentFront :
  rlayer.layer instanceof TeleLayer ? currentTele :
  rlayer.layer instanceof SwitchLayer ? currentSwitch :
  rlayer.layer instanceof SpeedupLayer ? currentSpeedup :
  rlayer.layer instanceof TuneLayer ? currentTune : null

$: normSelection = normalizeRange(selection)
$: selected = makeBoxSelection(current, normSelection)

function minmax(min: number, cur: number, max: number) {
  return Math.min(Math.max(min, cur), max)
}

function normalizeRange(range: Range): Range {
  const minX = Math.min(range.start.x, range.end.x)
  const maxX = Math.max(range.start.x, range.end.x)
  const minY = Math.min(range.start.y, range.end.y)
  const maxY = Math.max(range.start.y, range.end.y)

  return {
    start: { x: minX, y: minY },
    end: { x: maxX, y: maxY },
  }
}


function makeBoxSelection(cur: EditTileParams, sel: Range): EditTileParams[][] {
  const res: EditTileParams[][] = []

  for (let j = sel.start.y; j <= sel.end.y; j++) {
    const row = []
    for (let i = sel.start.x; i <= sel.end.x; i++) {
      row.push({
        ...cur, id: j * tileCount + i
      })
    }
    res.push(row)
  }
  
  return res
}

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
  if (id === 0) {
    return `
      background-image: url('/editor/checker.png');
      background-size: 16px;
      background-repeat: repeat;
    `
  }

  const row = Math.floor(id / tileCount)
  const col = id % tileCount
  const c = rlayer.layer instanceof TilesLayer ? rlayer.layer.color : { r: 255, g: 255, b: 255, a:255 }
  return `
    background-image: url('${url}');
    background-position-x: -${col}00%;
    background-position-y: -${row}00%;
    background-color: rgba(${c.r}, ${c.g}, ${c.b}, ${c.a / 255});
  `
}

$: buttonStyles = Array.from({length: tileCount * tileCount}, (_, i) => buttonStyle(url, i))

let boxStyle = ''

$: {
  if (boxSelect) {
    const [ x1, y1 ] = [ normSelection.start.x, normSelection.start.y ]
    const [ x2, y2 ] = [ normSelection.end.x, normSelection.end.y ]
    boxStyle = `
      width: ${(x2 - x1 + 1) * 100 / tileCount}%;
      height: ${(y2 - y1 + 1) * 100 / tileCount}%;
      left: ${x1 * 100 / tileCount}%;
      top: ${y1 * 100 / tileCount}%;
    `
  }
  else {
    boxStyle = `
      display: none;
    `
  }
}

function onMouseDown(e: MouseEvent, id: number) {
  const x = id % tileCount
  const y = Math.floor(id / tileCount)
  selection = {
    start: { x, y },
    end: { x, y },
  }
  
  if (e.shiftKey)
    boxSelect = true
  else
    tilesVisible = false
}

function onMouseOver(id: number) {
  if (boxSelect) {
    const x = id % tileCount
    const y = Math.floor(id / tileCount)
    selection.end = { x, y }
  }
}

function onMouseUp() {
  if (boxSelect) {
    boxSelect = false
    tilesVisible = false
  }
}

</script>

<div id="tile-selector">
  <div class="tile selected">
    <button on:click={() => tilesVisible = !tilesVisible} style={buttonStyles[selected[0][0].id]}></button>
    <button on:click={() => settingsVisible = !settingsVisible}><img src="/assets/tune.svg" alt='tile options' /></button>
  </div>
  <div class="tiles" class:hidden={!tilesVisible}>
    {#each buttonStyles as style, i}
      <button style={style} on:mousedown={(e) => onMouseDown(e, i)} on:mouseup={onMouseUp} on:mouseover={() => onMouseOver(i)} on:focus={() => {}}></button>
    {/each}
    <div class="box-select" style={boxStyle}></div>
  </div>
  <div class="settings" class:hidden = {!settingsVisible}>
    {#if rlayer.layer instanceof TilesLayer}
      <label>Tile flip Vertical <input type="checkbox" value={currentTile.flags & TileFlags.VFLIP}
        on:change={() => currentTile.flags ^= TileFlags.VFLIP}></label>
      <label>Tile flip Horizontal <input type="checkbox" value={currentTile.flags & TileFlags.HFLIP}
        on:change={() => currentTile.flags ^= TileFlags.HFLIP}></label>
      <label>Tile rotate <input type="checkbox" value={currentTile.flags & TileFlags.ROTATE}
        on:change={() => currentTile.flags ^= TileFlags.ROTATE}></label>
    {:else if rlayer.layer instanceof GameLayer}
      Nothing to set for the game layer.
    {:else if rlayer.layer instanceof FrontLayer}
      Nothing to set for the front layer.
    {:else if rlayer.layer instanceof TeleLayer}
      <label>Teleport target <input type="number" min={0} max={255} bind:value={currentTele.number}></label>
    {:else if rlayer.layer instanceof SwitchLayer}
      <label>Switch delay <input type="number" min={0} max={255} bind:value={currentSwitch.delay}></label>
    {:else if rlayer.layer instanceof SpeedupLayer}
      <label>Speedup force <input type="number" min={0} max={255} bind:value={currentSpeedup.force}></label>
      <label>Speedup max speed <input type="number" min={0} max={255} bind:value={currentSpeedup.maxSpeed}></label>
      <label>Speedup angle <input type="number" min={0} max={359} bind:value={currentSpeedup.angle}></label>
    {:else if rlayer.layer instanceof TuneLayer}
      <label>Tune zone <input type="number" min={0} max={255} bind:value={currentTune.number}></label>
    {/if}
  </div>
</div>
