import type { Layer } from '../../twmap/layer'
import { Map, type PhysicsLayer } from '../../twmap/map'
import { Image } from '../../twmap/image'
import {
  AnyTilesLayer,
  FrontLayer,
  GameLayer,
  SpeedupLayer,
  SwitchLayer,
  TeleLayer,
  TilesLayer,
  TuneLayer,
} from '../../twmap/tilesLayer'
import { TilesLayerFlags } from '../../twmap/types'
import type { WebSocketServer } from '../../server/server'
import type { Config, MapCreation, MapDetail } from '../../server/protocol'
import * as MapDir from '../../twmap/mapdir'
import { QuadsLayer } from '../../twmap/quadsLayer'
import { clearDialog, showInfo } from './dialog'

export type Ctor<T> = new (...args: any[]) => T

export type FormEvent<T> = Event & { currentTarget: EventTarget & T }
export type FormInputEvent = FormEvent<HTMLInputElement>

export async function download(path: string, name: string) {
  const id = showInfo(`Downloading '${name}'…`, 'none')
  try {
    const resp = await fetch(path)
    if (!resp.ok) throw await resp.text()
    const data = await resp.blob()
    const url = URL.createObjectURL(data)

    const link = document.createElement('a')
    link.href = url
    link.download = name

    document.body.append(link)
    link.click()
    link.remove()
    showInfo(`Downloaded '${name}'.`)
  } finally {
    clearDialog(id)
  }
}

export async function uploadMap(url: string, name: string, file: Blob) {
  const resp = await fetch(`${url}/maps/${name}`, {
    method: 'PUT',
    body: file,
  })
  if (!resp.ok) throw await resp.text()
}

export async function createMap(url: string, name: string, create: MapCreation) {
  const resp = await fetch(`${url}/maps/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(create),
  })
  if (!resp.ok) throw await resp.text()
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
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      resolve(data)
    }
  })
}

export function externalImageUrl(name: string) {
  return '/mapres/' + name + '.png'
}

export async function queryMaps(url: string): Promise<MapDetail[]> {
  function sortMaps(maps: MapDetail[]): MapDetail[] {
    return maps.sort((a, b) => {
      if (a.users === b.users) return a.name.localeCompare(b.name)
      else return b.users - a.users
    })
  }

  const resp = await fetch(`${url}/maps`)
  if (!resp.ok) throw await resp.text()

  const maps: MapDetail[] = await resp.json()
  sortMaps(maps)
  return maps
}

export async function queryConfig(url: string, mapName: string): Promise<Config> {
  const resp = await fetch(`${url}/maps/${mapName}/config`)
  const config: Config = await resp.json()
  return config
}

export async function queryMap(server: WebSocketServer, mapName: string): Promise<Map> {
  const resp = await server.fetch(`maps/${mapName}`)
  const data = await resp.arrayBuffer()
  const map = new Map()
  map.load(mapName, data)
  return map
}

export async function queryImageData(
  server: WebSocketServer,
  mapName: string,
  imageIndex: number
): Promise<ImageData> {
  const resp = await server.fetch(`maps/${mapName}/images/${imageIndex}`)
  const data = await resp.blob()
  const image = await decodePng(data)
  return image
}

export async function queryImage(
  server: WebSocketServer,
  mapName: string,
  imageIndex: number
): Promise<Image> {
  const data = await queryImageData(server, mapName, imageIndex)
  const img = new Image()
  const images = await server.query('get/images', undefined)
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

export function layerKind(layer: Layer): MapDir.LayerKind {
  if (layer instanceof FrontLayer) {
    return MapDir.LayerKind.Front
  } else if (layer instanceof GameLayer) {
    return MapDir.LayerKind.Game
  } else if (layer instanceof QuadsLayer) {
    return MapDir.LayerKind.Quads
  } else if (layer instanceof SpeedupLayer) {
    return MapDir.LayerKind.Speedup
  } else if (layer instanceof SwitchLayer) {
    return MapDir.LayerKind.Switch
  } else if (layer instanceof TeleLayer) {
    return MapDir.LayerKind.Tele
  } else if (layer instanceof TilesLayer) {
    return MapDir.LayerKind.Tiles
  } else if (layer instanceof TuneLayer) {
    return MapDir.LayerKind.Tune
  } else {
    throw 'unknown layer kind: ' + layer
  }
}

export function rem2px(rem: number) {
  return parseFloat(window.getComputedStyle(document.documentElement).fontSize) * rem
}
export function px2vw(px: number) {
  return (px / window.innerWidth) * 100
}
export function px2vh(px: number) {
  return (px / window.innerHeight) * 100
}
