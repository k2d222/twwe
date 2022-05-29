import type { DataFile } from './datafile'
import { Color, LayerTile, LayerType, MapLayerTiles, MapItemType } from './types'
import { Layer } from './layer'
import { parseLayerTiles, parseMapImage } from './parser'
import { Image } from './image'

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

  getTile(x: number, y: number) {
    return this.tiles[y * this.width + x]
  }

  load(df: DataFile, info: MapLayerTiles) {
    this.type = info.flags // game, tiles, tele…
    this.name = info.name
    this.width = info.width
    this.height = info.height
    this.color = info.color

    if (info.image !== -1) {
      const imagesInfo = df.getType(MapItemType.IMAGE)
      const imageItem = df.getItem(imagesInfo.start + info.image)
      const imageInfo = parseMapImage(imageItem.data)
      this.image = new Image()
      this.image.load(df, imageInfo)
    }
    else {
      this.image = null
    }

    const tileData = df.getData(info.data)
    this.tiles = parseLayerTiles(tileData, info.width * info.height)
  }
}
