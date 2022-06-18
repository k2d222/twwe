import type { DataFile } from './datafile'
import { Layer } from './layer'
import { LayerType, LayerQuad, MapLayerQuads, MapItemType } from './types'
import { parseLayerQuads, parseMapImage } from './parser'
import { Image } from './image'


export class QuadLayer extends Layer {
  quads: LayerQuad[]
  image: Image | null

  constructor() {
    super(LayerType.QUADS)
    this.quads = []
    this.image = null
  }

  load(df: DataFile, info: MapLayerQuads) {
    this.name = info.name

    const quadData = df.getData(info.data)
    this.quads = parseLayerQuads(quadData, info.numQuads)

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
  }
}