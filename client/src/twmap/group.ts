import type { Layer } from './layer'
import type { DataFile } from './datafile'
import type { Map } from './map'
import { TileLayer } from './tileLayer'
import { QuadLayer } from './quadLayer'
import { MapGroupObj, MapItemType, LayerType } from './types'
import { parseMapLayer, parseMapLayerTiles, parseMapLayerQuads } from './parser'

export class Group {
  name: string
  offX: number
  offY: number
  paraX: number
  paraY: number
  layers: Layer[]

  constructor() {
    this.name = ''
    this.offX = 0
    this.offY = 0
    this.paraX = 100
    this.paraY = 100
    this.layers = []
  }

  load(map: Map, df: DataFile, info: MapGroupObj) {
    this.name = info.name
    this.offX = info.offX
    this.offY = info.offY
    this.paraX = info.paraX
    this.paraY = info.paraY
    this.layers = this.loadLayers(map, df, info.startLayer, info.numLayers)
  }

  private loadLayers(map: Map, df: DataFile, startLayer: number, numLayers: number) {
    const layersInfo = df.getType(MapItemType.LAYER)
    
    if (!layersInfo)
      return []

    const layers = []

    for (let l = 0; l < numLayers; l++) {
      const layerItem = df.getItem(layersInfo.start + startLayer + l)
      const layerInfo = parseMapLayer(layerItem.data)

      if (layerInfo.type === LayerType.TILES) {
        const tileLayerInfo = parseMapLayerTiles(layerItem.data)
        const layer = new TileLayer()
        layer.load(map, df, tileLayerInfo)
        layers.push(layer)
      }
      else if (layerInfo.type === LayerType.QUADS) {
        const quadLayerInfo = parseMapLayerQuads(layerItem.data)
        const layer = new QuadLayer()
        layer.load(map, df, quadLayerInfo)
        layers.push(layer)
      }
      else {
        console.warn('unsupported layer type:', layerInfo.type, layerInfo)
      }
    }
    
    return layers
  }
}
