import type { DataFile } from './datafile'
import type { Map } from './map'
import type { Image } from './image'
import { Layer } from './layer'
import { LayerType, LayerQuad, MapLayerQuads } from './types'
import { parseLayerQuads } from './parser'


export class QuadLayer extends Layer {
  quads: LayerQuad[]
  image: Image | null

  constructor() {
    super(LayerType.QUADS)
    this.quads = []
    this.image = null
  }

  load(map: Map, df: DataFile, info: MapLayerQuads) {
    this.name = info.name

    const quadData = df.getData(info.data)
    this.quads = parseLayerQuads(quadData, info.numQuads)

    this.image = null
    if (info.image !== -1) {
      this.image = map.images[info.image]
    }
  }
}