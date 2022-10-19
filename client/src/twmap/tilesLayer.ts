import type { DataFile } from './datafile'
import type { Map } from './map'
import type { ColorEnvelope } from './envelope'
import * as Info from './types'
import { Layer } from './layer'
import type { Image } from './image'
import { parseTiles, parseTeleTiles, parseSpeedupTiles, parseTuneTiles, parseSwitchTiles } from './parser'

export function createLayer(flags: Info.TilesLayerFlags) {
  return flags === Info.TilesLayerFlags.TILES ? new TilesLayer()
       : flags === Info.TilesLayerFlags.GAME ? new GameLayer()
       : flags === Info.TilesLayerFlags.FRONT ? new FrontLayer()
       : flags === Info.TilesLayerFlags.TELE ? new TeleLayer()
       : flags === Info.TilesLayerFlags.SPEEDUP ? new SpeedupLayer()
       : flags === Info.TilesLayerFlags.SWITCH ? new SwitchLayer()
       : flags === Info.TilesLayerFlags.TUNE ? new TuneLayer()
       : null
}

export abstract class AnyTilesLayer<Tile extends { id: number }> extends Layer {
  flags: Info.TilesLayerFlags
  width: number
  height: number
  tiles: Tile[]

  constructor(flags: Info.TilesLayerFlags) {
    super(Info.LayerType.TILES)
    this.flags = flags
    this.width = 0
    this.height = 0
    this.tiles = []
  }

  init(width: number, height: number, fill: (i: number) => Tile) {
    this.width = width
    this.height = height
    this.tiles = Array.from({ length: width * height }, (_, i) => fill(i))
    return self
  }

  tileCount() {
    return this.tiles.reduce((acc, t) => acc + (t.id === 0 ? 0 : 1), 0)
  }

  getTile(x: number, y: number) {
    return this.tiles[y * this.width + x]
  }
  
  setTile(x: number, y: number, tile: Tile) {
    this.tiles[y * this.width + x] = tile
  }
  
  abstract defaultTile(): Tile;
  
  setWidth(width: number, fill: () => Tile) {
    if (width < this.width) {
      this.tiles = this.tiles.filter((_, i) => (i % this.width) < width)
    }
    else if (width > this.width) {
      for (let i = this.height; i > 0; i--) {
        const newTiles = Array.from({ length: width - this.width }, fill)
        this.tiles.splice(i * this.width, 0, ...newTiles)
      }
    }
    
    this.width = width
  }

  setHeight(height: number, fill: () => Tile) {
    if (height < this.height) {
      this.tiles.splice(height * this.width, (this.height - height) * this.width)
    }
    else if (height > this.height) {
      const newTiles = Array.from({ length: (height - this.height) * this.width }, fill)
      this.tiles.splice(this.height * this.width, 0, ...newTiles)
    }
    
    this.height = height
  }
  
  protected abstract load(map: Map, df: DataFile, info: Info.TilesLayer): void;
}

type AutomapperConfig = {
  config: number,
  seed: number,
  automatic: boolean,
}

export class TilesLayer extends AnyTilesLayer<Info.Tile> {
  color: Info.Color
  image: Image | null
  colorEnv: ColorEnvelope | null
  colorEnvOffset: number
  automapper: AutomapperConfig
  
  constructor() {
    super(Info.TilesLayerFlags.TILES)
    this.color = { r: 255, g: 255, b: 255, a: 255 }
    this.image = null
    this.colorEnv = null
    this.colorEnvOffset = 0
    this.automapper = {
      config: null,
      seed: 0,
      automatic: false,
    }
  }
  
  static defaultTile(): Info.Tile {
    return { id: 0, flags: 0 }
  }
  defaultTile() { return TilesLayer.defaultTile() }

  load(map: Map, df: DataFile, info: Info.TilesLayer) {
    if ('name' in info)
      this.name = info.name
    this.width = info.width
    this.height = info.height
    this.color = info.color
    this.colorEnv = info.colorEnv === -1 ? null : map.envelopes[info.colorEnv] as ColorEnvelope
    this.colorEnvOffset = info.colorEnvOffset

    this.image = null
    if (info.image !== -1) {
      this.image = map.images[info.image]
    }

    const tileData = df.getData(info.data)
    this.tiles = parseTiles(tileData, info.width * info.height)
  }
  
  static cloneTile(tile: Info.Tile): Info.Tile {
    return {
      id: tile.id,
      flags: tile.flags,
    }
  }
}

export class GameLayer extends AnyTilesLayer<Info.Tile> {
  color: Info.Color
  image: Image | null

  constructor() {
    super(Info.TilesLayerFlags.GAME)
    this.color = { r: 0, g: 0, b: 0, a: 0  }
    this.image = null
  }
  
  static defaultTile(): Info.Tile {
    return { id: 0, flags: 0 }
  }
  defaultTile() { return GameLayer.defaultTile() }

  load(map: Map, df: DataFile, info: Info.TilesLayer) {
    if ('name' in info)
      this.name = info.name
    this.width = info.width
    this.height = info.height
    this.color = info.color

    this.image = null
    if (info.image !== -1) {
      this.image = map.images[info.image]
    }

    const tileData = df.getData(info.data)
    this.tiles = parseTiles(tileData, info.width * info.height)
  }
}

export class FrontLayer extends AnyTilesLayer<Info.Tile> {
  color: Info.Color
  image: Image | null

  constructor() {
    super(Info.TilesLayerFlags.FRONT)
    this.color = { r: 0, g: 0, b: 0, a: 0  }
    this.image = null
  }
  
  static defaultTile(): Info.Tile {
    return { id: 0, flags: 0 }
  }
  defaultTile() { return FrontLayer.defaultTile() }

  load(map: Map, df: DataFile, info: Info.TilesLayer) {
    if ('name' in info)
      this.name = info.name
    this.width = info.width
    this.height = info.height
    this.color = info.color

    this.image = null
    if (info.image !== -1) {
      this.image = map.images[info.image]
    }

    const tileData = df.getData(info.dataFront)
    this.tiles = parseTiles(tileData, info.width * info.height)
  }
}

export class TeleLayer extends AnyTilesLayer<Info.Tele> {
  constructor() {
    super(Info.TilesLayerFlags.TELE)
  }
  
  static defaultTile(): Info.Tele {
    return { number: 0, id: 0 }
  }
  defaultTile() { return TeleLayer.defaultTile() }

  load(_: Map, df: DataFile, info: Info.TilesLayer) {
    if ('name' in info)
      this.name = info.name
    this.width = info.width
    this.height = info.height
    const tileData = df.getData(info.dataTele)
    this.tiles = parseTeleTiles(tileData, info.width * info.height)
  }
}

export class SpeedupLayer extends AnyTilesLayer<Info.Speedup> {
  constructor() {
    super(Info.TilesLayerFlags.SPEEDUP)
  }
  
  static defaultTile(): Info.Speedup {
    return { force: 50, maxSpeed: 0, id: 0, angle: 0 }
  }
  defaultTile() { return SpeedupLayer.defaultTile() }

  load(_: Map, df: DataFile, info: Info.TilesLayer) {
    if ('name' in info)
      this.name = info.name
    this.width = info.width
    this.height = info.height
    const tileData = df.getData(info.dataSpeedup)
    this.tiles = parseSpeedupTiles(tileData, info.width * info.height)
  }
}

export class SwitchLayer extends AnyTilesLayer<Info.Switch> {
  constructor() {
    super(Info.TilesLayerFlags.SWITCH)
  }
 
  static defaultTile(): Info.Switch {
    return { number: 0, id: 0, flags: 0, delay: 0 }
  }
  defaultTile() { return SwitchLayer.defaultTile() }

  load(_: Map, df: DataFile, info: Info.TilesLayer) {
    if ('name' in info)
      this.name = info.name
    this.width = info.width
    this.height = info.height
    const tileData = df.getData(info.dataSwitch)
    this.tiles = parseSwitchTiles(tileData, info.width * info.height)
  }
}
export class TuneLayer extends AnyTilesLayer<Info.Tune> {
  constructor() {
    super(Info.TilesLayerFlags.TUNE)
  }

  static defaultTile(): Info.Tune {
    return { number: 0, id: 0 }
  }
  defaultTile() { return TuneLayer.defaultTile() }

  load(_: Map, df: DataFile, info: Info.TilesLayer) {
    if ('name' in info)
      this.name = info.name
    this.width = info.width
    this.height = info.height
    const tileData = df.getData(info.dataTune)
    this.tiles = parseTuneTiles(tileData, info.width * info.height)
  }
}