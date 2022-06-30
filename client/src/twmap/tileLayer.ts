import type { DataFile } from './datafile'
import { Color, LayerTile, LayerType, MapLayerTiles, MapItemType } from './types'
import { Layer } from './layer'
import { parseLayerTiles, parseMapImage } from './parser'
import { Image } from './image'


function cloneLayerTile(tile: LayerTile): LayerTile {
  return {
    index: tile.index,
    flags: tile.flags,
  }
}

export class TileLayer extends Layer {
  width: number
  height: number
  tiles: LayerTile[]
  color: Color
  image: Image | null

  constructor() {
    super(LayerType.TILES)
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

  load(df: DataFile, info: MapLayerTiles) {
    this.type = info.flags // game, tiles, tele…
    this.name = info.name
    this.width = info.width
    this.height = info.height
    this.color = info.color

    this.image = null
    if (info.image !== -1) {
      const imagesInfo = df.getType(MapItemType.IMAGE)
      
      if (imagesInfo) {
        const imageItem = df.getItem(imagesInfo.start + info.image)
        const imageInfo = parseMapImage(imageItem.data)
        this.image = new Image()
        this.image.load(df, imageInfo)
      }
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

