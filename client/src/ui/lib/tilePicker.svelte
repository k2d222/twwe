<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type * as Info from '../../twmap/types'
  import * as MapDir from '../../twmap/mapdir'
  import type { AnyTilesLayer } from '../../twmap/tilesLayer'
  import type { RenderAnyTilesLayer } from '../../gl/renderTilesLayer'
  import type { Image } from '../../twmap/image'
  import type { Tile, Tele, Switch, Speedup, Tune, Coord } from '../../twmap/types'
  import { TileFlags } from '../../twmap/types'
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
  import { ColorPalette as PaletteIcon } from 'carbon-icons-svelte'

  type Range = {
    start: Coord
    end: Coord
  }

  const tileCount = 16

  export let rlayer: RenderAnyTilesLayer<AnyTilesLayer<{ id: number }>>
  export let image: Image
  export let selected: Info.AnyTile[][] = []

  const dispatch = createEventDispatcher<{
    select: Info.AnyTile[][]
  }>()

  $: dispatch('select', selected)

  let tilesVisible = false

  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D

  // inclusive range
  let selection: Range = {
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
  }

  $: normSelection = normalizeRange(selection)

  // this is a bit monolithic but hey typescript
  let currentTile: { kind: MapDir.LayerKind.Tiles } & Tile = {
    kind: MapDir.LayerKind.Tiles,
    ...TilesLayer.defaultTile(),
  }
  let currentGame: { kind: MapDir.LayerKind.Game } & Tile = {
    kind: MapDir.LayerKind.Game,
    ...GameLayer.defaultTile(),
  }
  let currentFront: { kind: MapDir.LayerKind.Front } & Tile = {
    kind: MapDir.LayerKind.Front,
    ...FrontLayer.defaultTile(),
  }
  let currentTele: { kind: MapDir.LayerKind.Tele } & Tele = {
    kind: MapDir.LayerKind.Tele,
    ...TeleLayer.defaultTile(),
  }
  let currentSwitch: { kind: MapDir.LayerKind.Switch } & Switch = {
    kind: MapDir.LayerKind.Switch,
    ...SwitchLayer.defaultTile(),
  }
  let currentSpeedup: { kind: MapDir.LayerKind.Speedup } & Speedup = {
    kind: MapDir.LayerKind.Speedup,
    ...SpeedupLayer.defaultTile(),
  }
  let currentTune: { kind: MapDir.LayerKind.Tune } & Tune = {
    kind: MapDir.LayerKind.Tune,
    ...TuneLayer.defaultTile(),
  }

  function onInputChanged() {
    currentTele.number = clamp(currentTele.number, 0, 255)
    currentSwitch.delay = clamp(currentSwitch.delay, 0, 255)
    currentSwitch.number = clamp(currentSwitch.number, 0, 255)
    currentSpeedup.angle = clamp(currentSpeedup.angle, 0, 359)
    currentSpeedup.maxSpeed = clamp(currentSpeedup.maxSpeed, 0, 255)
    currentSpeedup.force = clamp(currentSpeedup.force, 0, 255)
    currentTune.number = clamp(currentTune.number, 0, 255)
  }
  let current: Info.AnyTile | null
  let boxSelect = false

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
    ctx = canvas.getContext('2d')!
    Editor.on('keydown', onKeyDown)
    Editor.on('keyup', onKeyUp)
    mounted = true
  })

  onDestroy(() => {
    Editor.off('keydown', onKeyDown)
    Editor.off('keyup', onKeyUp)
    mounted = false
  })

  $: if (mounted) {
    drawLayer(image)
  }

  async function drawLayer(image: Image) {
    const img = await getCanvasImage(image)
    if (!mounted) return
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

  type ImageSource = CanvasImageSource & { width: number; height: number }
  async function getCanvasImage(image: Image): Promise<ImageSource> {
    if (image.data instanceof HTMLImageElement) {
      if (image.data.complete) {
        return image.data
      } else {
        return new Promise<ImageSource>(resolve => {
          const img = image.data as HTMLImageElement
          img.addEventListener('load', () => resolve(img))
        })
      }
    } else if (image.data instanceof ImageData) {
      return createImageBitmap(image.data)
    } else {
      return Promise.reject('image has no source')
    }
  }

  function colorToStr(c: Info.Color) {
    let hex = (i: number) => ('0' + i.toString(16)).slice(-2)
    return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`
  }

  function clamp(cur: number, min: number, max: number) {
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

  function makeBoxSelection(cur: Info.AnyTile, sel: Range): Info.AnyTile[][] {
    let res: Info.AnyTile[][] = []

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
    if (boxSelect && current) {
      const x = Math.floor((e.offsetX / (e.currentTarget as HTMLElement).clientWidth) * tileCount)
      const y = Math.floor((e.offsetY / (e.currentTarget as HTMLElement).clientHeight) * tileCount)
      selection.end = { x, y }
      boxSelect = false
      selected = makeBoxSelection(current, normalizeRange(selection))
      tilesVisible = false
    }
  }

  let pressed = false
  function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey || e.shiftKey || e.altKey) return

    if (e.key == ' ' && !pressed) {
      tilesVisible = true
      pressed = true
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    if (e.ctrlKey || e.shiftKey || e.altKey) return

    if (e.key == ' ') {
      tilesVisible = false
      pressed = false
    }
  }
</script>

<div id="tile-picker">
  <div class="picker" class:hidden={!tilesVisible && !boxSelect}>
    <div class="content">
      <div class="tiles">
        <div class="header">
          {#if rlayer.layer instanceof TeleLayer}
            <label>
              Teleport target <input
                type="number"
                min={0}
                max={255}
                bind:value={currentTele.number}
                on:change={onInputChanged}
              />
            </label>
          {:else if rlayer.layer instanceof SpeedupLayer}
            <label>
              Speedup force <input
                type="number"
                min={0}
                max={255}
                bind:value={currentSpeedup.force}
                on:change={onInputChanged}
              />
            </label>
            <label>
              Speedup max speed <input
                type="number"
                min={0}
                max={255}
                bind:value={currentSpeedup.maxSpeed}
                on:change={onInputChanged}
              />
            </label>
            <label>
              Speedup angle <input
                type="number"
                min={0}
                max={359}
                bind:value={currentSpeedup.angle}
                on:change={onInputChanged}
              />
            </label>
          {:else if rlayer.layer instanceof SwitchLayer}
            <label>
              Switch number <input
                type="number"
                min={0}
                max={255}
                bind:value={currentSwitch.number}
                on:change={onInputChanged}
              />
            </label>
            <label>
              Switch delay <input
                type="number"
                min={0}
                max={255}
                bind:value={currentSwitch.delay}
                on:change={onInputChanged}
              />
            </label>
          {:else if rlayer.layer instanceof TuneLayer}
            <label>
              Tune zone <input
                type="number"
                min={0}
                max={255}
                bind:value={currentTune.number}
                on:change={onInputChanged}
              />
            </label>
          {:else}
            Select tiles to place on the map.
          {/if}
        </div>

        <canvas
          bind:this={canvas}
          on:mousedown={onMouseDown}
          on:mousemove={onMouseMove}
          on:mouseup={onMouseUp}
        />

        <div class="box-select" style={boxStyle} />
      </div>
    </div>
  </div>

  <div class="controls">
    <Button
      expressive
      on:click={() => (tilesVisible = !tilesVisible)}
      icon={PaletteIcon}
      iconDescription="Tile picker"
      tooltipPosition="top"
      kind="secondary"
    />
  </div>
</div>
