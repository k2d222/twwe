import type { SendMap, SendImage } from '../../server/protocol'
import type { Layer } from '../../twmap/layer'
import { server } from '../global'
import { Map, PhysicsLayer } from '../../twmap/map'
import { Image } from '../../twmap/image'
import { AnyTilesLayer } from '../../twmap/tilesLayer'
import { TilesLayerFlags } from '../../twmap/types'

export type Ctor<T> = new(...args: any[]) => T

export async function decodePng(file: File): Promise<ImageData> {
  return new Promise<ImageData>((resolve, reject) => {
    const img = document.createElement('img')
    img.src = URL.createObjectURL(file)
    
    img.onerror = (e) => {
      reject(e)
    }
  
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      resolve(data)
    }
  })
}

export function externalImageUrl(name: string) {
  return '/mapres/' + name + '.png'
}

export async function queryMapBinary(sendMap: SendMap): Promise<ArrayBuffer> {
  let data: ArrayBuffer
  const listener = (d: ArrayBuffer) => data = d
  server.binaryListeners.push(listener)
  await server.query('sendmap', sendMap)
  let index = server.binaryListeners.indexOf(listener)
  server.binaryListeners.splice(index, 1)
  return data
}

export async function queryMap(sendMap: SendMap): Promise<Map> {
  const data = await queryMapBinary(sendMap)
  const map = new Map()
  map.load(sendMap.name, data)
  return map
}

export async function queryImage(sendImage: SendImage): Promise<Image> {
  let data: ArrayBuffer
  const listener = (d: ArrayBuffer) => data = d
  server.binaryListeners.push(listener)
  const imageInfo = await server.query('sendimage', sendImage)
  let index = server.binaryListeners.indexOf(listener)
  server.binaryListeners.splice(index, 1)
  const image = new ImageData(new Uint8ClampedArray(data), imageInfo.width, imageInfo.height)
  const img = new Image()
  img.loadEmbedded(image)
  img.name = imageInfo.name
  return img
}


export const PhysicsLayers = [
  TilesLayerFlags.GAME,
  TilesLayerFlags.FRONT,
  TilesLayerFlags.TELE,
  TilesLayerFlags.SPEEDUP,
  TilesLayerFlags.SWITCH,
  TilesLayerFlags.TUNE,
]

export function isPhysicsLayer(layer: Layer): layer is PhysicsLayer {
  return layer instanceof AnyTilesLayer && PhysicsLayers.includes(layer.flags)
}

export function layerIndex(map: Map, layer: Layer): [number, number] {
  for (let g = 0; g < map.groups.length; g++) {
    const rgroup = map.groups[g]
    for (let l = 0; l < rgroup.layers.length; l++) {
      if (rgroup.layers[l] === layer) {
        return [ g, l ]
      }
    }
  }

  return [ -1, -1 ]
}

export function rem2px(rem: number) {
  return parseFloat(window.getComputedStyle(document.documentElement).fontSize) * rem
}
export function px2vw(px: number) {
  return px / window.screen.width * 100
}
export function px2vh(px: number) {
  return px / window.screen.height * 100
}

