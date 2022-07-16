<script lang="ts">
import type { Image } from '../../twmap/image'
import type { RenderMap } from '../../gl/renderMap'
import type { EditTileParams } from 'src/server/protocol'
import { TileFlags, Tile, Tele, Switch, Speedup, Tune } from '../../twmap/types'
import { TilesLayer, GameLayer, FrontLayer, TeleLayer, SwitchLayer, SpeedupLayer, TuneLayer } from '../../twmap/tilesLayer'

export let rmap: RenderMap
export let g: number
export let l: number

// this is a bit monolithic but hey typescript
let selectedTile:    { type: 'tile'    } & Tile    = { type: 'tile',    ...TilesLayer.defaultTile()   }
let selectedGame:    { type: 'tile'    } & Tile    = { type: 'tile',    ...GameLayer.defaultTile()    }
let selectedFront:   { type: 'tile'    } & Tile    = { type: 'tile',    ...FrontLayer.defaultTile()   }
let selectedTele:    { type: 'tele'    } & Tele    = { type: 'tele',    ...TeleLayer.defaultTile()    }
let selectedSwitch:  { type: 'switch'  } & Switch  = { type: 'switch',  ...SwitchLayer.defaultTile()  }
let selectedSpeedup: { type: 'speedup' } & Speedup = { type: 'speedup', ...SpeedupLayer.defaultTile() }
let selectedTune:    { type: 'tune'    } & Tune    = { type: 'tune',    ...TuneLayer.defaultTile()    }

export let tilesVisible = false
export let settingsVisible = false
$: {
  if (tilesVisible)
    settingsVisible = false
  else if (settingsVisible)
    tilesVisible = false
}

$: rlayer = rmap.groups[g].layers[l]
$: url = getImgURL(rlayer.texture.image)

export let selected: EditTileParams
$: selected =
  rlayer.layer instanceof TilesLayer ? selectedTile :
  rlayer.layer instanceof GameLayer ? selectedGame :
  rlayer.layer instanceof FrontLayer ? selectedFront :
  rlayer.layer instanceof TeleLayer ? selectedTele :
  rlayer.layer instanceof SwitchLayer ? selectedSwitch :
  rlayer.layer instanceof SpeedupLayer ? selectedSpeedup :
  rlayer.layer instanceof TuneLayer ? selectedTune : null


const tileCount = 16

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
  selected.id = id
  tilesVisible = false
}

</script>

<div id="tile-selector">
  <div class="tile selected">
    <button on:click={() => tilesVisible = !tilesVisible} style={buttonStyles[selected.id]}></button>
    <button on:click={() => settingsVisible = !settingsVisible}><img src="/assets/tune.svg" alt='tile options' /></button>
  </div>
  <div class="tiles" class:hidden={!tilesVisible}>
    {#each buttonStyles as style, i}
      <button on:click={() => onTileClick(i)} style={style}></button>
    {/each}
  </div>
  <div class="settings" class:hidden = {!settingsVisible}>
    {#if rlayer.layer instanceof TilesLayer}
      <label>Tile flip Vertical <input type="checkbox" value={selectedTile.flags & TileFlags.VFLIP}
        on:change={() => selectedTile.flags ^= TileFlags.VFLIP}></label>
      <label>Tile flip Horizontal <input type="checkbox" value={selectedTile.flags & TileFlags.HFLIP}
        on:change={() => selectedTile.flags ^= TileFlags.HFLIP}></label>
      <label>Tile rotate <input type="checkbox" value={selectedTile.flags & TileFlags.ROTATE}
        on:change={() => selectedTile.flags ^= TileFlags.ROTATE}></label>
    {:else if rlayer.layer instanceof GameLayer}
      Nothing to set for the game layer.
    {:else if rlayer.layer instanceof FrontLayer}
      Nothing to set for the front layer.
    {:else if rlayer.layer instanceof TeleLayer}
      <label>Teleport target <input type="number" min={0} max={255} bind:value={selectedTele.number}></label>
    {:else if rlayer.layer instanceof SwitchLayer}
      <label>Switch delay <input type="number" min={0} max={255} bind:value={selectedSwitch.delay}></label>
    {:else if rlayer.layer instanceof SpeedupLayer}
      <label>Speedup force <input type="number" min={0} max={255} bind:value={selectedSpeedup.force}></label>
      <label>Speedup max speed <input type="number" min={0} max={255} bind:value={selectedSpeedup.maxSpeed}></label>
      <label>Speedup angle <input type="number" min={0} max={359} bind:value={selectedSpeedup.angle}></label>
    {:else if rlayer.layer instanceof TuneLayer}
      <label>Tune zone <input type="number" min={0} max={255} bind:value={selectedTune.number}></label>
    {/if}
  </div>
</div>
