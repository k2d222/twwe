import type { Layer } from '../../twmap/layer'
import { Map, type PhysicsLayer } from '../../twmap/map'
import { Image } from '../../twmap/image'
import { AnyTilesLayer } from '../../twmap/tilesLayer'
import { TilesLayerFlags } from '../../twmap/types'
import type { WebSocketServer } from 'src/server/server'
import type { MapCreation, MapDetail } from 'src/server/protocol'

export type Ctor<T> = new (...args: any[]) => T

export type FormEvent<T> = Event & { currentTarget: EventTarget & T }
export type FormInputEvent = FormEvent<HTMLInputElement>

export async function download(file: string, name: string) {
  const resp = await fetch(file)
  const data = await resp.blob()
  const url = URL.createObjectURL(data)

  const link = document.createElement('a')
  link.href = url
  link.download = name

  document.body.append(link)
  link.click()
  link.remove()
}

export async function uploadMap(httpRoot: string, name: string, file: Blob) {
  await fetch(`${httpRoot}/maps/${name}`, {
    method: 'PUT',
    body: file
  })
}

export async function createMap(httpRoot: string, name: string, create: MapCreation) {
  await fetch(`${httpRoot}/maps/${name}`, {
    method: 'POST',
    body: JSON.stringify(create)
  })
}

export async function uploadImage(httpRoot: string, mapName: string, imageName: string, file: Blob) {
  await fetch(`${httpRoot}/maps/${mapName}/map/images/${imageName}`, {
    method: 'POST',
    body: file
  })
}

export async function decodePng(file: Blob): Promise<ImageData> {
  return new Promise<ImageData>((resolve, reject) => {
    const img = document.createElement('img')
    img.src = URL.createObjectURL(file)

    img.onerror = e => {
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

export async function queryMaps(httpRoot: string): Promise<MapDetail[]> {
  function sortMaps(maps: MapDetail[]): MapDetail[] {
    return maps.sort((a, b) => {
      if (a.users === b.users) return a.name.localeCompare(b.name)
      else return b.users - a.users
    })
  }

  const resp = await fetch(`${httpRoot}/maps`)
  const maps: MapDetail[] = await resp.json()
  sortMaps(maps)
  return maps
}

export async function queryMap(httpRoot: string, mapName: string): Promise<Map> {
  const resp = await fetch(`${httpRoot}/maps/${mapName}`)
  const data = await resp.arrayBuffer()
  const map = new Map()
  map.load(mapName, data)
  return map
}

export async function queryImageData(httpRoot: string, mapName: string, imageIndex: number): Promise<ImageData> {
  const resp = await fetch(`${httpRoot}/maps/${mapName}/images/${imageIndex}`)
  const data = await resp.blob()
  const image = await decodePng(data)
  return image
}

export async function queryImage(server: WebSocketServer, httpRoot: string, mapName: string, imageIndex: number): Promise<Image> {
  const data = await queryImageData(httpRoot, mapName, imageIndex)
  const img = new Image()
  const images = await server.query('map/get/images', undefined)
  img.loadEmbedded(data)
  img.name = images[imageIndex]
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
        return [g, l]
      }
    }
  }

  return [-1, -1]
}

export function rem2px(rem: number) {
  return parseFloat(window.getComputedStyle(document.documentElement).fontSize) * rem
}
export function px2vw(px: number) {
  return (px / window.screen.width) * 100
}
export function px2vh(px: number) {
  return (px / window.screen.height) * 100
}
