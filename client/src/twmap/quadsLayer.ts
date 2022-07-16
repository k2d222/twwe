import type { DataFile } from './datafile'
import type { Map } from './map'
import type { Image } from './image'
import { Layer } from './layer'
import * as Info from './types'
import { parseQuads } from './parser'


export class QuadsLayer extends Layer {
  quads: Info.Quad[]
  image: Image | null

  constructor() {
    super(Info.LayerType.QUADS)
    this.quads = []
    this.image = null
  }

  load(map: Map, df: DataFile, info: Info.QuadsLayer) {
    if ('name' in info)
      this.name = info.name

    const quadData = df.getData(info.data)
    this.quads = parseQuads(quadData, info.numQuads)

    this.image = null
    if (info.image !== -1) {
      this.image = map.images[info.image]
    }
  }
}