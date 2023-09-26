import type { DataFile } from './datafile'
import type { Map } from './map'
import type { Image } from './image'
import type { PositionEnvelope, ColorEnvelope } from './envelope'
import { Layer } from './layer'
import * as Info from './types'
import { parseQuads } from './parser'

export interface Quad {
  points: Info.Coord[]
  colors: Info.Color[]
  texCoords: Info.Coord[]
  posEnv: PositionEnvelope | null
  posEnvOffset: number
  colorEnv: ColorEnvelope | null
  colorEnvOffset: number
}

export class QuadsLayer extends Layer {
  quads: Quad[]
  image: Image | null

  constructor() {
    super(Info.LayerType.QUADS)
    this.quads = []
    this.image = null
  }

  load(map: Map, df: DataFile, info: Info.QuadsLayer) {
    if (info.name !== undefined) this.name = info.name

    const quadData = df.getData(info.data)
    this.quads = parseQuads(quadData, info.numQuads).map(q => {
      const { points, colors, texCoords, posEnv, posEnvOffset, colorEnv, colorEnvOffset } = q
      return {
        points,
        colors,
        texCoords,
        posEnv: posEnv === -1 ? null : (map.envelopes[posEnv] as PositionEnvelope),
        posEnvOffset,
        colorEnv: colorEnv === -1 ? null : (map.envelopes[colorEnv] as ColorEnvelope),
        colorEnvOffset,
      }
    })

    this.image = null
    if (info.image !== -1) {
      this.image = map.images[info.image]
    }
  }
}
