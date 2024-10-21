<script lang="ts">
  import { createEventDispatcher } from 'svelte'
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
  import { rmap } from '../global'
  import type * as Info from '../../twmap/types'

  import FlipV from '../../../assets/flip-v.svg?component'
  import FlipH from '../../../assets/flip-h.svg?component'
  import RotateCW from '../../../assets/rotate-cw.svg?component'
  import RotateCCW from '../../../assets/rotate-ccw.svg?component'
  import { LayerKind } from '../../twmap/mapdir'

  export let brush: Editor.Brush

  const dispatch = createEventDispatcher<{
    change: Editor.Brush
  }>()

  onMount(() => {
    Editor.on('keypress', onKeyPress)
  })

  onDestroy(() => {
    Editor.off('keypress', onKeyPress)
  })

  function clamp(cur: number, min: number, max: number) {
    if (isNaN(cur)) return min
    else return Math.min(Math.max(min, cur), max)
  }

  function brushRotateCW(sel: Info.AnyTile[][]) {
    return Array.from({ length: sel[0].length }, (_, j) =>
      Array.from({ length: sel.length }, (_, i) => sel[sel.length - 1 - i][j])
    )
  }
  function brushRotateCCW(sel: Info.AnyTile[][]) {
    return Array.from({ length: sel[0].length }, (_, j) =>
      Array.from({ length: sel.length }, (_, i) => sel[i][sel[0].length - 1 - j])
    )
  }
  function brushFlipV(sel: Info.AnyTile[][]) {
    return sel.reverse()
  }
  function brushFlipH(sel: Info.AnyTile[][]) {
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

  function tilesFlipV(layer: AnyTilesLayer<any>, tiles: Info.AnyTile[][]) {
    const flipFn: ((tile: Info.AnyTile) => void) | false =
      layer instanceof TilesLayer
        ? (tile: Info.Tile) => {
            if (tile.flags & TileFlags.ROTATE) tile.flags ^= TileFlags.VFLIP
            else tile.flags ^= TileFlags.HFLIP
          }
        : layer instanceof GameLayer
          ? (tile: Info.Tile) => {
              if (isDirectionalGameTile(tile.id)) {
                if (!(tile.flags & TileFlags.ROTATE))
                  tile.flags ^= TileFlags.HFLIP | TileFlags.VFLIP
              }
            }
          : layer instanceof SwitchLayer
            ? (tile: Info.Switch) => {
                if (isDirectionalSwitchTile(tile.id)) {
                  if (!(tile.flags & TileFlags.ROTATE))
                    tile.flags ^= TileFlags.HFLIP | TileFlags.VFLIP
                }
              }
            : layer instanceof SpeedupLayer
              ? (tile: Info.Speedup) => {
                  tile.angle = (360 - tile.angle) % 360
                }
              : false

    if (flipFn) {
      for (let row of tiles) {
        for (let tile of row) {
          flipFn(tile)
        }
      }
    }
  }

  function tilesFlipH(layer: AnyTilesLayer<any>, tiles: Info.AnyTile[][]) {
    const flipFn: ((tile: Info.AnyTile) => void) | false =
      layer instanceof TilesLayer
        ? (tile: Info.Tile) => {
            if (tile.flags & TileFlags.ROTATE) tile.flags ^= TileFlags.HFLIP
            else tile.flags ^= TileFlags.VFLIP
          }
        : layer instanceof GameLayer
          ? (tile: Info.Tile) => {
              if (isDirectionalGameTile(tile.id)) {
                if (tile.flags & TileFlags.ROTATE) tile.flags ^= TileFlags.HFLIP | TileFlags.VFLIP
              }
            }
          : layer instanceof SwitchLayer
            ? (tile: Info.Switch) => {
                if (isDirectionalSwitchTile(tile.id)) {
                  if (tile.flags & TileFlags.ROTATE) tile.flags ^= TileFlags.HFLIP | TileFlags.VFLIP
                }
              }
            : layer instanceof SpeedupLayer
              ? (tile: Info.Speedup) => {
                  tile.angle = (540 - tile.angle) % 360
                }
              : false

    if (flipFn) {
      for (let row of tiles) {
        for (let tile of row) {
          flipFn(tile)
        }
      }
    }
  }

  function tilesRotateCW(layer: AnyTilesLayer<any>, tiles: Info.AnyTile[][]) {
    function doRotate(tile: Info.AnyTile) {
      if ('flags' in tile) {
        if (tile.flags & TileFlags.ROTATE) {
          tile.flags ^= TileFlags.HFLIP
          tile.flags ^= TileFlags.VFLIP
        }
        tile.flags ^= TileFlags.ROTATE
      }
    }

    const rotateFn: ((tile: Info.AnyTile) => void) | false =
      layer instanceof TilesLayer
        ? (tile: Info.Tile) => {
            doRotate(tile)
          }
        : layer instanceof GameLayer
          ? (tile: Info.Tile) => {
              if (isDirectionalGameTile(tile.id)) doRotate(tile)
            }
          : layer instanceof SwitchLayer
            ? (tile: Info.Switch) => {
                if (isDirectionalSwitchTile(tile.id)) doRotate(tile)
              }
            : layer instanceof SpeedupLayer
              ? (tile: Info.Speedup) => {
                  tile.angle = (tile.angle + 90) % 360
                }
              : false

    if (rotateFn) {
      for (let row of tiles) {
        for (let tile of row) {
          rotateFn(tile)
        }
      }
    }
  }

  function tilesRotateCCW(layer: AnyTilesLayer<any>, tiles: Info.AnyTile[][]) {
    function doRotate(tile: Info.AnyTile) {
      if ('flags' in tile) {
        if (!(tile.flags & TileFlags.ROTATE)) {
          tile.flags ^= TileFlags.HFLIP
          tile.flags ^= TileFlags.VFLIP
        }
        tile.flags ^= TileFlags.ROTATE
      }
    }

    const rotateFn: ((tile: Info.AnyTile) => void) | false =
      layer instanceof TilesLayer
        ? (tile: Info.Tile) => {
            doRotate(tile)
          }
        : layer instanceof GameLayer
          ? (tile: Info.Tile) => {
              if (isDirectionalGameTile(tile.id)) doRotate(tile)
            }
          : layer instanceof SwitchLayer
            ? (tile: Info.Switch) => {
                if (isDirectionalSwitchTile(tile.id)) doRotate(tile)
              }
            : layer instanceof SpeedupLayer
              ? (tile: Info.Speedup) => {
                  tile.angle = (tile.angle + 270) % 360
                }
              : false

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
      const rlayer = $rmap.groups[brush.group].layers[layer.layer]

      if (rlayer.layer instanceof AnyTilesLayer) {
        tilesFlipV(rlayer.layer, layer.tiles)
        layer.tiles = brushFlipV(layer.tiles)
      }
    }

    dispatch('change', brush)
  }

  function onFlipH() {
    for (const layer of brush.layers) {
      const rlayer = $rmap.groups[brush.group].layers[layer.layer]

      if (rlayer.layer instanceof AnyTilesLayer) {
        tilesFlipH(rlayer.layer, layer.tiles)
        layer.tiles = brushFlipH(layer.tiles)
      }
    }

    dispatch('change', brush)
  }

  function onRotateCW() {
    for (const layer of brush.layers) {
      const rlayer = $rmap.groups[brush.group].layers[layer.layer]

      if (rlayer.layer instanceof AnyTilesLayer) {
        tilesRotateCW(rlayer.layer, layer.tiles)
        layer.tiles = brushRotateCW(layer.tiles)
      }
    }

    dispatch('change', brush)
  }

  function onRotateCCW() {
    for (const layer of brush.layers) {
      const rlayer = $rmap.groups[brush.group].layers[layer.layer]

      if (rlayer.layer instanceof AnyTilesLayer) {
        tilesRotateCCW(rlayer.layer, layer.tiles)
        layer.tiles = brushRotateCCW(layer.tiles)
      }
    }

    dispatch('change', brush)
  }

  function onKeyPress(e: KeyboardEvent) {
    if (e.ctrlKey || e.altKey) return

    if (['r', 't', 'v', 'h', 'n', 'm'].includes(e.key.toLowerCase())) e.preventDefault()

    if (e.key === 'r') onRotateCW()
    else if (e.key === 'R' || e.key === 't') onRotateCCW()
    else if (e.key === 'v' || e.key === 'm') onFlipV()
    else if (e.key === 'h' || e.key === 'n') onFlipH()
  }

  function tilesProperty(tiles: Info.AnyTile[][], prop: string): number | undefined {
    let res: number

    for (const row of tiles) {
      for (const tile of row) {
        if (prop in tile) {
          if (res === undefined) {
            res = tile[prop]
          } else if (tile[prop] !== res) {
            return undefined
          }
        }
      }
    }

    return res
  }

  function onSetProperty(prop: string, val: number) {
    brush.layers.forEach(l =>
      l.tiles.forEach(r =>
        r.forEach(t => {
          if (prop in t) {
            t[prop] = val
          }
        })
      )
    )
    dispatch('change', brush)
  }
</script>

<div id="edit-brush">
  <div class="buttons">
    <button class="default" on:click={onFlipV}>
      <FlipV />
    </button>
    <button class="default" on:click={onFlipH}>
      <FlipH />
    </button>
    <button class="default" on:click={onRotateCW}>
      <RotateCW />
    </button>
    <button class="default" on:click={onRotateCCW}>
      <RotateCCW />
    </button>
    {#if brush.layers.length === 1}
      {@const layer = brush.layers[0]}
      {#if layer.kind === LayerKind.Tele}
        <label>
          <span>Teleport target</span>
          <input
            type="number"
            min={0}
            max={255}
            value={tilesProperty(layer.tiles, 'number')}
            on:change={e => onSetProperty('number', clamp(parseInt(e.currentTarget.value), 0, 255))}
          />
        </label>
      {:else if layer.kind === LayerKind.Speedup}
        <label>
          <span>Speedup force</span>
          <input
            type="number"
            min={0}
            max={255}
            value={tilesProperty(layer.tiles, 'force')}
            on:change={e => onSetProperty('force', clamp(parseInt(e.currentTarget.value), 0, 255))}
          />
        </label>
        <label>
          <span>Speedup max speed</span>
          <input
            type="number"
            min={0}
            max={255}
            value={tilesProperty(layer.tiles, 'maxSpeed')}
            on:change={e =>
              onSetProperty('maxSpeed', clamp(parseInt(e.currentTarget.value), 0, 255))}
          />
        </label>
        <label>
          <span>Speedup angle</span>
          <input
            type="number"
            min={0}
            max={359}
            value={tilesProperty(layer.tiles, 'angle')}
            on:change={e => onSetProperty('angle', clamp(parseInt(e.currentTarget.value), 0, 255))}
          />
        </label>
      {:else if layer.kind === LayerKind.Switch}
        <label>
          <span>Switch number</span>
          <input
            type="number"
            min={0}
            max={255}
            value={tilesProperty(layer.tiles, 'number')}
            on:change={e => onSetProperty('number', clamp(parseInt(e.currentTarget.value), 0, 255))}
          />
        </label>
        <label>
          <span>Switch delay</span>
          <input
            type="number"
            min={0}
            max={255}
            value={tilesProperty(layer.tiles, 'delay')}
            on:change={e => onSetProperty('delay', clamp(parseInt(e.currentTarget.value), 0, 255))}
          />
        </label>
      {:else if layer.kind === LayerKind.Tune}
        <label>
          <span>Tune zone</span>
          <input
            type="number"
            min={0}
            max={255}
            value={tilesProperty(layer.tiles, 'number')}
            on:change={e => onSetProperty('number', clamp(parseInt(e.currentTarget.value), 0, 255))}
          />
        </label>
      {/if}
    {/if}
  </div>
</div>
