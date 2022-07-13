import type { DataFile } from './datafile'
import type { Map } from './map'
import type { Image } from './image'
import * as Info from './types'
import { Layer } from './layer'
import { parseTiles } from './parser'


function cloneLayerTile(tile: Info.Tile): Info.Tile {
  return {
    index: tile.index,
    flags: tile.flags,
  }
}

export class TilesLayer extends Layer {
  flags: Info.TilesLayerFlags
  width: number
  height: number
  tiles: Info.Tile[]
  color: Info.Color
  image: Image | null

  constructor() {
    super(Info.LayerType.TILES)
    this.flags = Info.TilesLayerFlags.TILES
    this.width = 0
    this.height = 0
    this.tiles = []
    this.color = { r: 0, g: 0, b: 0, a: 0 }
    this.image = null
  }

  static create(width: number, height: number, fill: Info.Tile) {
    const self = new TilesLayer()
    self.width = width
    self.height = height
    self.tiles = new Array<Info.Tile>(width * height).fill(fill)
    return self
  }

  getTile(x: number, y: number) {
    return this.tiles[y * this.width + x]
  }

  load(map: Map, df: DataFile, info: Info.TilesLayer) {
    this.flags = info.flags
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
  
  setWidth(width: number, fill: Info.Tile) {
    if (width < this.width) {
      this.tiles = this.tiles.filter((_, i) => (i % this.width) < width)
    }
    else if (width > this.width) {
      for (let i = this.height; i > 0; i--) {
        const newTiles = Array.from({ length: width - this.width }, () => cloneLayerTile(fill))
        this.tiles.splice(i * this.width, 0, ...newTiles)
      }
    }
    
    this.width = width
  }

  setHeight(height: number, fill: Info.Tile) {
    if (height < this.height) {
      this.tiles.splice(height * this.width, (this.height - height) * this.width)
    }
    else if (height > this.height) {
      const newTiles = Array.from({ length: (height - this.height) * this.width }, () => cloneLayerTile(fill))
      this.tiles.splice(this.height * this.width, 0, ...newTiles)
    }
    
    this.height = height
  }
}

