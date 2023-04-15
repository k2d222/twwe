<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type * as Info from '../../twmap/types'
  import type { EditTileParams } from '../../server/protocol'
  import type { Image } from '../../twmap/image'
  import type { AnyTilesLayer } from '../../twmap/tilesLayer'
  import type { RenderAnyTilesLayer } from '../../gl/renderTilesLayer'
  import { TileFlags, Tile, Tele, Switch, Speedup, Tune, Coord } from '../../twmap/types'
  import {
    TilesLayer,
    GameLayer,
    FrontLayer,
    TeleLayer,
    SwitchLayer,
    SpeedupLayer,
    TuneLayer,
  } from '../../twmap/tilesLayer'
  import * as Editor from './editor'
  import { onMount, onDestroy } from 'svelte'
  import { Button } from 'carbon-components-svelte'
  import { ColorPalette as PaletteIcon, Tools as ToolsIcon } from 'carbon-icons-svelte'

  type Range = {
    start: Coord
    end: Coord
  }

  const tileCount = 16

  export let rlayer: RenderAnyTilesLayer<AnyTilesLayer<{ id: number }>>
  export let selected: EditTileParams[][] = []

  const dispatch = createEventDispatcher()
  $: dispatch('select', selected)

  let tilesVisible = false
  let settingsVisible = false

  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D

  // inclusive range
  let selection: Range = {
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
  }

  $: normSelection = normalizeRange(selection)

  // this is a bit monolithic but hey typescript
  let currentTile: { type: 'tile' } & Tile = { type: 'tile', ...TilesLayer.defaultTile() }
  let currentGame: { type: 'tile' } & Tile = { type: 'tile', ...GameLayer.defaultTile() }
  let currentFront: { type: 'tile' } & Tile = { type: 'tile', ...FrontLayer.defaultTile() }
  let currentTele: { type: 'tele' } & Tele = { type: 'tele', ...TeleLayer.defaultTile() }
  let currentSwitch: { type: 'switch' } & Switch = { type: 'switch', ...SwitchLayer.defaultTile() }
  let currentSpeedup: { type: 'speedup' } & Speedup = {
    type: 'speedup',
    ...SpeedupLayer.defaultTile(),
  }
  let currentTune: { type: 'tune' } & Tune = { type: 'tune', ...TuneLayer.defaultTile() }

  $: currentTele.number = minmax(0, currentTele.number, 255)
  $: currentSwitch.delay = minmax(0, currentSwitch.delay, 255)
  $: currentSwitch.number = minmax(0, currentSwitch.number, 255)
  $: currentSpeedup.angle = minmax(0, currentSpeedup.angle, 359)
  $: currentSpeedup.maxSpeed = minmax(0, currentSpeedup.maxSpeed, 255)
  $: currentSpeedup.force = minmax(0, currentSpeedup.force, 255)
  $: currentTune.number = minmax(0, currentTune.number, 255)

  let current: EditTileParams
  let boxSelect = false

  $: {
    if (tilesVisible) settingsVisible = false
    else if (settingsVisible) tilesVisible = false
  }
  $: if (selected.length === 0) settingsVisible = false

  $: current =
    rlayer.layer instanceof TilesLayer
      ? currentTile
      : rlayer.layer instanceof GameLayer
      ? currentGame
      : rlayer.layer instanceof FrontLayer
      ? currentFront
      : rlayer.layer instanceof TeleLayer
      ? currentTele
      : rlayer.layer instanceof SwitchLayer
      ? currentSwitch
      : rlayer.layer instanceof SpeedupLayer
      ? currentSpeedup
      : rlayer.layer instanceof TuneLayer
      ? currentTune
      : null

  let mounted = false
  onMount(() => {
    ctx = canvas.getContext('2d')
    drawLayer()
    Editor.on('keydown', onKeyDown)
    Editor.on('keyup', onKeyUp)
    Editor.on('keypress', onKeyPress)
    mounted = true
  })

  onDestroy(() => {
    Editor.off('keydown', onKeyDown)
    Editor.off('keyup', onKeyUp)
    Editor.off('keypress', onKeyPress)
    mounted = false
  })

  $: if (mounted && rlayer) {
    drawLayer()
  }

  async function drawLayer() {
    const img = await getCanvasImage(rlayer.texture.image)
    if (!mounted)
      return
    canvas.width = img.width as number
    canvas.height = img.height as number
    ctx.globalCompositeOperation = 'copy'
    ctx.drawImage(img, 0, 0)

    if (rlayer.layer instanceof TilesLayer) {
      // see https://stackoverflow.com/q/31607663/8775116
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = colorToStr(rlayer.layer.color)
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'destination-atop'
      ctx.drawImage(img, 0, 0)
    }

    // the first tile is always transparent
    ctx.clearRect(0, 0, canvas.width / tileCount, canvas.height / tileCount)
  }

  async function getCanvasImage(image: Image): Promise<CanvasImageSource> {
    if (image.data instanceof HTMLImageElement) {
      ctx.drawImage(image.data, 0, 0)
      return image.data
    } else if (image.data instanceof ImageData) {
      return createImageBitmap(image.data)
    } else if (image.img) {
      return image.img
    }
  }

  function colorToStr(c: Info.Color) {
    let hex = (i: number) => ('0' + i.toString(16)).slice(-2)
    return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`
  }

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
    let res: EditTileParams[][] = []

    for (let j = sel.start.y; j <= sel.end.y; j++) {
      const row = []
      for (let i = sel.start.x; i <= sel.end.x; i++) {
        row.push({
          ...cur,
          id: j * tileCount + i,
        })
      }
      res.push(row)
    }

    return res
  }

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

  let boxStyle = ''

  $: {
    if (boxSelect) {
      const [x1, y1] = [normSelection.start.x, normSelection.start.y]
      const [x2, y2] = [normSelection.end.x, normSelection.end.y]
      boxStyle = `
      width: ${((x2 - x1 + 1) * 100) / tileCount}%;
      height: ${((y2 - y1 + 1) * 100) / tileCount}%;
      left: ${(x1 * 100) / tileCount}%;
      top: ${(y1 * 100) / tileCount}%;
    `
    } else {
      boxStyle = `
      display: none;
    `
    }
  }

  function onMouseDown(e: MouseEvent) {
    const x = Math.floor((e.offsetX / (e.currentTarget as HTMLElement).clientWidth) * tileCount)
    const y = Math.floor((e.offsetY / (e.currentTarget as HTMLElement).clientHeight) * tileCount)
    currentTile.flags = currentTile.flags & TileFlags.OPAQUE // reset rotation/flip
    selection = {
      start: { x, y },
      end: { x, y },
    }

    boxSelect = true
  }

  function onMouseMove(e: MouseEvent) {
    if (boxSelect) {
      const x = Math.floor((e.offsetX / (e.currentTarget as HTMLElement).clientWidth) * tileCount)
      const y = Math.floor((e.offsetY / (e.currentTarget as HTMLElement).clientHeight) * tileCount)
      selection.end = { x, y }
    }
  }

  function onMouseUp(e: MouseEvent) {
    if (boxSelect) {
      const x = Math.floor((e.offsetX / (e.currentTarget as HTMLElement).clientWidth) * tileCount)
      const y = Math.floor((e.offsetY / (e.currentTarget as HTMLElement).clientHeight) * tileCount)
      selection.end = { x, y }
      boxSelect = false
      tilesVisible = false
      selected = makeBoxSelection(current, normalizeRange(selection))
    }
  }

  // whether a physics tile can have flags (be rotated / mirrored)
  function isDirectionalGameTile(id: number) {
    return [60, 61, 64, 65, 67, 224, 225].includes(id)
  }
  function isDirectionalSwitchTile(id: number) {
    return [224, 225].includes(id)
  }

  function onFlipV() {
    if (selected.length === 0) return

    const flipFn =
      rlayer.layer instanceof TilesLayer ? (tile: EditTileParams) => {
        if (tile.type === 'tile') {
          if (tile.flags & TileFlags.ROTATE) tile.flags ^= TileFlags.VFLIP
          else tile.flags ^= TileFlags.HFLIP
        }
      } :
      rlayer.layer instanceof GameLayer ? (tile: EditTileParams) => {
        if (tile.type === 'tile' && isDirectionalGameTile(tile.id)) {
          if (!(tile.flags & TileFlags.ROTATE)) tile.flags ^= TileFlags.HFLIP | TileFlags.VFLIP
        }
      } :
      rlayer.layer instanceof SwitchLayer ? (tile: EditTileParams) => {
        if (tile.type === 'switch' && isDirectionalSwitchTile(tile.id)) {
          if (!(tile.flags & TileFlags.ROTATE)) tile.flags ^= TileFlags.HFLIP | TileFlags.VFLIP
        }
      } :
      rlayer.layer instanceof SpeedupLayer ? (tile: EditTileParams) => {
        if (tile.type === 'speedup') {
          tile.angle = (360 - tile.angle) % 360
        }
      } :
      false

    if (flipFn) {
      for (let row of selected) {
        for (let tile of row) {
          flipFn(tile)
        }
      }
    }

    selected = brushFlipV(selected)
  }

  function onFlipH() {
    if (selected.length === 0) return

    const flipFn =
      rlayer.layer instanceof TilesLayer ? (tile: EditTileParams) => {
        if (tile.type === 'tile') {
          if (tile.flags & TileFlags.ROTATE) tile.flags ^= TileFlags.HFLIP
          else tile.flags ^= TileFlags.VFLIP
        }
      } :
      rlayer.layer instanceof GameLayer ? (tile: EditTileParams) => {
        if (tile.type === 'tile' && isDirectionalGameTile(tile.id)) {
          if (tile.flags & TileFlags.ROTATE) tile.flags ^= TileFlags.HFLIP | TileFlags.VFLIP
        }
      } :
      rlayer.layer instanceof SwitchLayer ? (tile: EditTileParams) => {
        if (tile.type === 'switch' && isDirectionalSwitchTile(tile.id)) {
          if (tile.flags & TileFlags.ROTATE) tile.flags ^= TileFlags.HFLIP | TileFlags.VFLIP
        }
      } :
      rlayer.layer instanceof SpeedupLayer ? (tile: EditTileParams) => {
        if (tile.type === 'speedup') {
          tile.angle = (540 - tile.angle) % 360
        }
      } :
      false

    if (flipFn) {
      for (let row of selected) {
        for (let tile of row) {
          flipFn(tile)
        }
      }
    }

    selected = brushFlipH(selected)
  }
  function onRotateCW() {
    if (selected.length === 0) return

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
      rlayer.layer instanceof TilesLayer ? (tile: EditTileParams) => {
        doRotate(tile)
      } :
      rlayer.layer instanceof GameLayer ? (tile: EditTileParams) => {
        if (isDirectionalGameTile(tile.id)) doRotate(tile)
      } :
      rlayer.layer instanceof SwitchLayer ? (tile: EditTileParams) => {
        if (isDirectionalSwitchTile(tile.id)) doRotate(tile)
      } :
      rlayer.layer instanceof SpeedupLayer ? (tile: EditTileParams) => {
        if (tile.type === 'speedup') {
          tile.angle = (tile.angle + 90) % 360
        }
      } :
      false

    if (rotateFn) {
      for (let row of selected) {
        for (let tile of row) {
          rotateFn(tile)
        }
      }
    }

    selected = brushRotateCW(selected)
  }
  function onRotateCCW() {
    if (selected.length === 0) return

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
      rlayer.layer instanceof TilesLayer ? (tile: EditTileParams) => {
        doRotate(tile)
      } :
      rlayer.layer instanceof GameLayer ? (tile: EditTileParams) => {
        if (isDirectionalGameTile(tile.id)) doRotate(tile)
      } :
      rlayer.layer instanceof SwitchLayer ? (tile: EditTileParams) => {
        if (isDirectionalSwitchTile(tile.id)) doRotate(tile)
      } :
      rlayer.layer instanceof SpeedupLayer ? (tile: EditTileParams) => {
        if (tile.type === 'speedup') {
          tile.angle = (tile.angle + 270) % 360
        }
      } :
      false

    if (rotateFn) {
      for (let row of selected) {
        for (let tile of row) {
          rotateFn(tile)
        }
      }
    }

    selected = brushRotateCCW(selected)
  }

  function onKeyPress(e: KeyboardEvent) {
    if (e.ctrlKey || e.altKey) return

    if (['r', 'v', 'h', 'n', 'm'].includes(e.key.toLowerCase())) e.preventDefault()

    if (e.key === 'r') onRotateCW()
    else if (e.key === 'R') onRotateCCW()
    else if (e.key === 'v' || e.key === 'm') onFlipV()
    else if (e.key === 'h' || e.key === 'n') onFlipH()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey || e.shiftKey || e.altKey) return

    if (e.key == ' ') {
      tilesVisible = true
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    if (e.ctrlKey || e.shiftKey || e.altKey) return

    if (e.key == ' ') {
      tilesVisible = false
    }
  }
</script>

<div id="tile-selector">
  <div class="controls">
    <Button
      expressive
      on:click={() => (tilesVisible = !tilesVisible)}
      icon={PaletteIcon}
      iconDescription="Tile picker"
      tooltipPosition="top"
      kind="secondary"
    />
    <Button
      expressive
      on:click={() => (settingsVisible = !settingsVisible)}
      icon={ToolsIcon}
      iconDescription="Tile options"
      tooltipPosition="top"
      kind="secondary"
      disabled={selected.length === 0}
    />
  </div>
  <div class="picker" class:hidden={!tilesVisible && !boxSelect}>
    <div class="header">
      {#if rlayer.layer instanceof TeleLayer}
        <label>
          Teleport target <input type="number" min={0} max={255} bind:value={currentTele.number} />
        </label>
      {:else if rlayer.layer instanceof SwitchLayer}
        <label>
          Switch delay <input type="number" min={0} max={255} bind:value={currentSwitch.delay} />
        </label>
      {:else if rlayer.layer instanceof SpeedupLayer}
        <label>
          Speedup force <input type="number" min={0} max={255} bind:value={currentSpeedup.force} />
        </label>
        <label>
          Speedup max speed <input
            type="number"
            min={0}
            max={255}
            bind:value={currentSpeedup.maxSpeed}
          />
        </label>
        <label>
          Speedup angle <input type="number" min={0} max={359} bind:value={currentSpeedup.angle} />
        </label>
      {:else if rlayer.layer instanceof TuneLayer}
        <label>
          Tune zone <input type="number" min={0} max={255} bind:value={currentTune.number} />
        </label>
      {:else}
        Select tiles to place on the map.
      {/if}
    </div>
    <div class="tiles">
      <canvas
        bind:this={canvas}
        on:mousedown={onMouseDown}
        on:mousemove={onMouseMove}
        on:mouseup={onMouseUp}
      />
      <div class="box-select" style={boxStyle} />
    </div>
  </div>
  <div class="settings picker" class:hidden={!settingsVisible}>
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
</div>
