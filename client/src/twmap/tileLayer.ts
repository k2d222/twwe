import type { DataFile } from './datafile'
import type { Map } from './map'
import type { Image } from './image'
import { Color, LayerTile, LayerType, MapLayerTiles, MapItemType, TileLayerFlags } from './types'
import { Layer } from './layer'
import { parseLayerTiles } from './parser'


function cloneLayerTile(tile: LayerTile): LayerTile {
  return {
    index: tile.index,
    flags: tile.flags,
  }
}

export class TileLayer extends Layer {
  flags: TileLayerFlags
  width: number
  height: number
  tiles: LayerTile[]
  color: Color
  image: Image | null

  constructor() {
    super(LayerType.TILES)
    this.flags = TileLayerFlags.TILES
    this.width = 0
    this.height = 0
    this.tiles = []
    this.color = { r: 0, g: 0, b: 0, a: 0 }
    this.image = null
  }

  static create(width: number, height: number, fill: LayerTile) {
    const self = new TileLayer()
    self.width = width
    self.height = height
    self.tiles = new Array<LayerTile>(width * height).fill(fill)
    return self
  }

  getTile(x: number, y: number) {
    return this.tiles[y * this.width + x]
  }

  load(map: Map, df: DataFile, info: MapLayerTiles) {
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
    this.tiles = parseLayerTiles(tileData, info.width * info.height)
  }
  
  setWidth(width: number, fill: LayerTile) {
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

  setHeight(height: number, fill: LayerTile) {
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

