import { Layer } from './layer'
import { LayerType, LayerQuad, MapLayerQuads } from './types'
import { parseLayerQuads } from './parser'
import { DataFile } from './datafile'


export class QuadLayer extends Layer {
  name: string
  quads: LayerQuad[]
  
  constructor(quads: LayerQuad[]) {
    super(LayerType.QUADS)
    this.quads = quads // TODO: why clone in original fork?
  }
  
  load(df: DataFile, info: MapLayerQuads) {
    this.name = info.name

		let quadData = df.getData(info.data)
    this.quads = parseLayerQuads(quadData, info.numQuads)
  }
}