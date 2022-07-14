import type { DataFile } from './datafile'
import type { Map } from './map'
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

export abstract class AnyTilesLayer<Tile> extends Layer {
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

  init(width: number, height: number, fill: () => Tile) {
    this.width = width
    this.height = height
    this.tiles = Array.from({ length: width * height }, fill)
    return self
  }

  getTile(x: number, y: number) {
    return this.tiles[y * this.width + x]
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

export class TilesLayer extends AnyTilesLayer<Info.Tile> {
  color: Info.Color
  image: Image | null
  
  constructor() {
    super(Info.TilesLayerFlags.TILES)
    this.color = { r: 0, g: 0, b: 0, a: 0  }
    this.image = null
  }
  
  defaultTile(): Info.Tile {
    return { index: 0, flags: 0 }
  }

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
  
  static cloneTile(tile: Info.Tile): Info.Tile {
    return {
      index: tile.index,
      flags: tile.flags,
    }
  }
}

export class GameLayer extends TilesLayer {
  constructor() {
    super()
    this.flags = Info.TilesLayerFlags.GAME
  }
}

export class FrontLayer extends TilesLayer {
  constructor() {
    super()
    this.flags = Info.TilesLayerFlags.FRONT
  }

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
  
  defaultTile(): Info.Tele {
    return { number: 0, id: 0 }
  }

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
  
  defaultTile(): Info.Speedup {
    return { force: 0, maxSpeed: 0, id: 0, angle: 0 }
  }

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
 
  defaultTile(): Info.Switch {
    return { number: 0, id: 0, flags: 0, delay: 0 }
  }

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

  defaultTile(): Info.Tune {
    return { number: 0, id: 0 }
  }

  load(_: Map, df: DataFile, info: Info.TilesLayer) {
    if ('name' in info)
      this.name = info.name
    this.width = info.width
    this.height = info.height
    const tileData = df.getData(info.dataTune)
    this.tiles = parseTuneTiles(tileData, info.width * info.height)
  }
}