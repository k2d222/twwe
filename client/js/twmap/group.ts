// import { Texture } from './texture'
import { Layer } from './layer'
import { TileLayer } from './tileLayer'
import { QuadLayer } from './quadLayer'
import { MapGroupObj, MapItemType, LayerType } from './types'
import { parseMapLayer, parseMapLayerTiles, parseMapLayerQuads, parseLayerTiles } from './parser'
import { DataFile } from "./datafile"

export class Group {
  name: string
  offX: number
  offY: number
  paraX: number
  paraY: number
  layers: Layer[]
   
  constructor() {
    this.name = "unnamed group"
    this.offX = 0
    this.offY = 0
    this.paraX = 0
    this.paraY = 0
    this.layers = []
  }
  
  load(df: DataFile, info: MapGroupObj) {
    this.name = info.name
    this.offX = info.offX
    this.offY = info.offY
    this.paraX = info.parallaxX
    this.paraY = info.parallaxY
    this.loadLayers(df, info.startLayer, info.numLayers)
  }
  
  // addQuadLayer(texture: Texture, quads: Quad[]) {
  //   this.layers.push(new QuadLayer(texture, quads))
  // }
  
  // addTileLayer(width: number, height: number, tiles: any, color: ObjColor, texture: Texture) {
  // 	let layer = new TileLayer(width, height, tiles, color, this)
  // 	layer.texture = texture
  // 	this.layers.push(layer)
  // }

  private loadLayers(df: DataFile, startLayer: number, numLayers: number) {
  	let layersInfo = df.getType(MapItemType.LAYER)

  	for (let l = 0; l < numLayers; l++) {
  		let layerItem = df.getItem(layersInfo.start + startLayer + l)
  		let layerInfo = parseMapLayer(layerItem.data)

  		if (layerInfo.type === LayerType.TILES) {
  			let tileLayerInfo = parseMapLayerTiles(layerItem.data)
        let layer = new TileLayer()
        layer.load(df, tileLayerInfo)
        this.layers.push(layer)
  		}
      else if(layerInfo.type === LayerType.QUADS) {
        console.log("TODO")
  			let quadLayerInfo = parseMapLayerQuads(layerItem.data)
        let layer = new QuadLayer()
        layer.load(df, quadLayerInfo)
        this.layers.push(layer)
  		}
  	}     
  }
}
