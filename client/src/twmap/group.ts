import type { Layer } from './layer'
import type { DataFile } from './datafile'
import type { Map } from './map'
import { createLayer } from './tilesLayer'
import { QuadsLayer } from './quadsLayer'
import * as Info from './types'
import { parseLayer, parseTilesLayer, parseQuadsLayer } from './parser'

export class Group {
  name: string
  offX: number
  offY: number
  paraX: number
  paraY: number
  clipping: boolean
  clipX: number
  clipY: number
  clipW: number
  clipH: number
  layers: Layer[]

  constructor() {
    this.name = ''
    this.offX = 0
    this.offY = 0
    this.paraX = 100
    this.paraY = 100
    this.clipping = false
    this.clipX = 0
    this.clipY = 0
    this.clipW = 0
    this.clipH = 0
    this.layers = []
  }

  load(map: Map, df: DataFile, info: Info.Group) {
    this.name = info.name ?? ''
    this.offX = info.offX
    this.offY = info.offY
    this.paraX = info.paraX
    this.paraY = info.paraY
    this.clipping = info.clipping
    this.clipX = info.clipX
    this.clipY = info.clipY
    this.clipW = info.clipW
    this.clipH = info.clipH
    this.layers = this.loadLayers(map, df, info.startLayer, info.numLayers)
  }

  private loadLayers(map: Map, df: DataFile, startLayer: number, numLayers: number) {
    const layersInfo = df.getType(Info.ItemType.LAYER)

    if (!layersInfo) return []

    const layers = []

    for (let l = 0; l < numLayers; l++) {
      const layerItem = df.getItem(layersInfo.start + startLayer + l)
      const layerInfo = parseLayer(layerItem.data)

      if (layerInfo.type === Info.LayerType.TILES) {
        const tilesLayerInfo = parseTilesLayer(layerItem.data)
        const layer = createLayer(tilesLayerInfo.flags)
        layer.load(map, df, tilesLayerInfo)
        layer.detail = (layerInfo.flags & Info.LayerFlags.DETAIL) === 1
        layers.push(layer)
      } else if (layerInfo.type === Info.LayerType.QUADS) {
        const quadsLayerInfo = parseQuadsLayer(layerItem.data)
        const layer = new QuadsLayer()
        layer.load(map, df, quadsLayerInfo)
        layer.detail = (layerInfo.flags & Info.LayerFlags.DETAIL) === 1
        layers.push(layer)
      } else {
        console.warn('unsupported layer type:', layerInfo.type, layerInfo)
      }
    }

    return layers
  }
}
