import { Layer } from './layer'
import { LayerType, LayerQuad, MapLayerQuads, MapItemType } from './types'
import { parseLayerQuads, parseMapImage } from './parser'
import { DataFile } from './datafile'
import { Image } from './image'


export class QuadLayer extends Layer {
  quads: LayerQuad[]
  image: Image | null
  
  constructor() {
    super(LayerType.QUADS)
  }
  
  load(df: DataFile, info: MapLayerQuads) {
    this.name = info.name

		let quadData = df.getData(info.data)
    this.quads = parseLayerQuads(quadData, info.numQuads)

		if(info.image !== -1) {
	    let imagesInfo = df.getType(MapItemType.IMAGE)
			let imageItem = df.getItem(imagesInfo.start + info.image)
	    let imageInfo = parseMapImage(imageItem.data)
	    this.image = new Image()
	    this.image.load(df, imageInfo)
		}
		else {
			this.image = null
		}
  }
}