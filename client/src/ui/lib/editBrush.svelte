<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { EditTileParams } from '../../server/protocol'
  import { TileFlags } from '../../twmap/types'
  import {
    TilesLayer,
    GameLayer,
    SwitchLayer,
    SpeedupLayer,
    AnyTilesLayer,
  } from '../../twmap/tilesLayer'
  import * as Editor from './editor'
  import { onMount, onDestroy } from 'svelte'
  import type { RenderMap } from 'src/gl/renderMap'

  export let brush: Editor.Brush
  export let rmap: RenderMap

  const dispatch = createEventDispatcher<{
    change: Editor.Brush
  }>()

  onMount(() => {
    Editor.on('keypress', onKeyPress)
  })

  onDestroy(() => {
    Editor.off('keypress', onKeyPress)
  })

  function brushRotateCW(sel: EditTileParams[][]) {
    return Array.from({ length: sel[0].length }, (_, j) =>
      Array.from({ length: sel.length }, (_, i) => sel[sel.length - 1 - i][j])
    )
  }
  function brushRotateCCW(sel: EditTileParams[][]) {
    return Array.from({ length: sel[0].length }, (_, j) =>
      Array.from({ length: sel.length }, (_, i) => sel[i][sel[0].length - 1 - j])
    )
  }
  function brushFlipV(sel: EditTileParams[][]) {
    return sel.reverse()
  }
  function brushFlipH(sel: EditTileParams[][]) {
    // WARN: mutates the array
    return sel.map(row => row.reverse())
  }

  // whether a physics tile can have flags (be rotated / mirrored)
  function isDirectionalGameTile(id: number) {
    return [60, 61, 64, 65, 67, 224, 225].includes(id)
  }
  function isDirectionalSwitchTile(id: number) {
    return [224, 225].includes(id)
  }

  function tilesFlipV(layer: AnyTilesLayer<any>, tiles: EditTileParams[][]) {
    const flipFn =
      layer instanceof TilesLayer ? (tile: EditTileParams) => {
        if (tile.type === 'tile') {
          if (tile.flags & TileFlags.ROTATE) tile.flags ^= TileFlags.VFLIP
          else tile.flags ^= TileFlags.HFLIP
        }
      } :
      layer instanceof GameLayer ? (tile: EditTileParams) => {
        if (tile.type === 'tile' && isDirectionalGameTile(tile.id)) {
          if (!(tile.flags & TileFlags.ROTATE)) tile.flags ^= TileFlags.HFLIP | TileFlags.VFLIP
        }
      } :
      layer instanceof SwitchLayer ? (tile: EditTileParams) => {
        if (tile.type === 'switch' && isDirectionalSwitchTile(tile.id)) {
          if (!(tile.flags & TileFlags.ROTATE)) tile.flags ^= TileFlags.HFLIP | TileFlags.VFLIP
        }
      } :
      layer instanceof SpeedupLayer ? (tile: EditTileParams) => {
        if (tile.type === 'speedup') {
          tile.angle = (360 - tile.angle) % 360
        }
      } :
      false
    
    if (flipFn) {
      for (let row of tiles) {
        for (let tile of row) {
          flipFn(tile)
        }
      }
    }
  }

  function tilesFlipH(layer: AnyTilesLayer<any>, tiles: EditTileParams[][]) {
    const flipFn =
      layer instanceof TilesLayer ? (tile: EditTileParams) => {
        if (tile.type === 'tile') {
          if (tile.flags & TileFlags.ROTATE) tile.flags ^= TileFlags.HFLIP
          else tile.flags ^= TileFlags.VFLIP
        }
      } :
      layer instanceof GameLayer ? (tile: EditTileParams) => {
        if (tile.type === 'tile' && isDirectionalGameTile(tile.id)) {
          if (tile.flags & TileFlags.ROTATE) tile.flags ^= TileFlags.HFLIP | TileFlags.VFLIP
        }
      } :
      layer instanceof SwitchLayer ? (tile: EditTileParams) => {
        if (tile.type === 'switch' && isDirectionalSwitchTile(tile.id)) {
          if (tile.flags & TileFlags.ROTATE) tile.flags ^= TileFlags.HFLIP | TileFlags.VFLIP
        }
      } :
      layer instanceof SpeedupLayer ? (tile: EditTileParams) => {
        if (tile.type === 'speedup') {
          tile.angle = (540 - tile.angle) % 360
        }
      } :
      false

    if (flipFn) {
      for (let row of tiles) {
        for (let tile of row) {
          flipFn(tile)
        }
      }
    }
  }

  function tilesRotateCW(layer: AnyTilesLayer<any>, tiles: EditTileParams[][]) {
    function doRotate(tile: EditTileParams) {
      if ('flags' in tile) {
        if (tile.flags & TileFlags.ROTATE) {
          tile.flags ^= TileFlags.HFLIP
          tile.flags ^= TileFlags.VFLIP
        }
        tile.flags ^= TileFlags.ROTATE
      }
    }

    const rotateFn =
      layer instanceof TilesLayer ? (tile: EditTileParams) => {
        doRotate(tile)
      } :
      layer instanceof GameLayer ? (tile: EditTileParams) => {
        if (isDirectionalGameTile(tile.id)) doRotate(tile)
      } :
      layer instanceof SwitchLayer ? (tile: EditTileParams) => {
        if (isDirectionalSwitchTile(tile.id)) doRotate(tile)
      } :
      layer instanceof SpeedupLayer ? (tile: EditTileParams) => {
        if (tile.type === 'speedup') {
          tile.angle = (tile.angle + 90) % 360
        }
      } :
      false

    if (rotateFn) {
      for (let row of tiles) {
        for (let tile of row) {
          rotateFn(tile)
        }
      }
    }
  }

  function tilesRotateCCW(layer: AnyTilesLayer<any>, tiles: EditTileParams[][]) {
    function doRotate(tile: EditTileParams) {
      if ('flags' in tile) {
        if (!(tile.flags & TileFlags.ROTATE)) {
          tile.flags ^= TileFlags.HFLIP
          tile.flags ^= TileFlags.VFLIP
        }
        tile.flags ^= TileFlags.ROTATE
      }
    }

    const rotateFn =
      layer instanceof TilesLayer ? (tile: EditTileParams) => {
        doRotate(tile)
      } :
      layer instanceof GameLayer ? (tile: EditTileParams) => {
        if (isDirectionalGameTile(tile.id)) doRotate(tile)
      } :
      layer instanceof SwitchLayer ? (tile: EditTileParams) => {
        if (isDirectionalSwitchTile(tile.id)) doRotate(tile)
      } :
      layer instanceof SpeedupLayer ? (tile: EditTileParams) => {
        if (tile.type === 'speedup') {
          tile.angle = (tile.angle + 270) % 360
        }
      } :
      false

    if (rotateFn) {
      for (let row of tiles) {
        for (let tile of row) {
          rotateFn(tile)
        }
      }
    }
  }


  function onFlipV() {
    for (const layer of brush.layers) {
      const rlayer = rmap.groups[brush.group].layers[layer.layer]

      if (rlayer.layer instanceof AnyTilesLayer) {
        tilesFlipV(rlayer.layer, layer.tiles)
        layer.tiles = brushFlipV(layer.tiles)
      }
    }

    dispatch('change', brush)
  }

  function onFlipH() {
    for (const layer of brush.layers) {
      const rlayer = rmap.groups[brush.group].layers[layer.layer]

      if (rlayer.layer instanceof AnyTilesLayer) {
        tilesFlipH(rlayer.layer, layer.tiles)
        layer.tiles = brushFlipH(layer.tiles)
      }
    }

    dispatch('change', brush)
  }

  function onRotateCW() {
    for (const layer of brush.layers) {
      const rlayer = rmap.groups[brush.group].layers[layer.layer]

      if (rlayer.layer instanceof AnyTilesLayer) {
        tilesRotateCW(rlayer.layer, layer.tiles)
        layer.tiles = brushRotateCW(layer.tiles)
      }
    }

    dispatch('change', brush)
  }

  function onRotateCCW() {
    for (const layer of brush.layers) {
      const rlayer = rmap.groups[brush.group].layers[layer.layer]

      if (rlayer.layer instanceof AnyTilesLayer) {
        tilesRotateCCW(rlayer.layer, layer.tiles)
        layer.tiles = brushRotateCCW(layer.tiles)
      }
    }

    dispatch('change', brush)
  }

  function onKeyPress(e: KeyboardEvent) {
    if (e.ctrlKey || e.altKey) return

    if (['r', 'v', 'h', 'n', 'm'].includes(e.key.toLowerCase())) e.preventDefault()

    if (e.key === 'r') onRotateCW()
    else if (e.key === 'R') onRotateCCW()
    else if (e.key === 'v' || e.key === 'm') onFlipV()
    else if (e.key === 'h' || e.key === 'n') onFlipH()
  }

</script>

<div id="edit-brush">
  <div class="buttons">
    <button class="default" on:click={onFlipV}>
      <img alt="Flip Vertically" src="/assets/flip-v.svg" />
    </button>
    <button class="default" on:click={onFlipH}>
      <img alt="Flip Horizontally" src="/assets/flip-h.svg" />
    </button>
    <button class="default" on:click={onRotateCW}>
      <img alt="Rotate Clockwise" src="/assets/rotate-cw.svg" />
    </button>
    <button class="default" on:click={onRotateCCW}>
      <img alt="Rotate Counterclockwise" src="/assets/rotate-ccw.svg" />
    </button>
  </div>
</div>

