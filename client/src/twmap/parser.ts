import type { MapGroupObj, MapLayer, MapLayerQuads, MapLayerTiles, LayerQuad, LayerTile, MapImage, Color, Coord } from './types'
import { DataReader } from './dataReader'

export function parseMapGroup(groupData: ArrayBuffer): MapGroupObj {
  const d = new DataReader(groupData)
  d.reset()

  return {
    version: d.uint32(),
    offX: d.int32(),
    offY: d.int32(),
    paraX: d.int32(),
    paraY: d.int32(),
    startLayer: d.uint32(),
    numLayers: d.uint32(),
    useClipping: d.uint32(),

    // version 2 extension
    clipX: d.int32(),
    clipY: d.int32(),
    clipW: d.int32(),
    clipH: d.int32(),

    // version 3 extension
    name: d.int32Str(3),
  }
}

export function parseMapLayer(layerData: ArrayBuffer): MapLayer {
  const d = new DataReader(layerData)
  d.reset()

  return {
    version: d.uint32(),
    type: d.uint32(),
    flags: d.uint32(),
  }
}

export function parseMapLayerQuads(layerData: ArrayBuffer): MapLayerQuads {
  const d = new DataReader(layerData)
  d.reset()

	/*obj.version =*/ d.uint32()
	/*obj.type =*/ d.uint32()
	/*obj.flags =*/ d.uint32()

  return {
    version: d.uint32(),
    numQuads: d.uint32(),
    data: d.int32(),
    image: d.int32(),
    name: d.int32Str(3),
  }
}

export function parseMapLayerTiles(layerData: ArrayBuffer): MapLayerTiles {
  const d = new DataReader(layerData)
  d.reset()

	/*obj.version =*/ d.uint32()
	/*obj.type =*/ d.uint32()
	/*obj.flags =*/ d.uint32()

  return {
    version: d.uint32(),
    width: d.int32(),
    height: d.int32(),
    flags: d.uint32(),

    color: {
      r: d.uint32() & 0xff,
      g: d.uint32() & 0xff,
      b: d.uint32() & 0xff,
      a: d.uint32() & 0xff,
    },

    colorEnv: d.int32(),
    colorEnvOffset: d.int32(),

    image: d.int32(),
    data: d.int32(),

    name: d.int32Str(3),
  }
}

export function parseMapImage(layerData: ArrayBuffer): MapImage {
  const d = new DataReader(layerData)
  d.reset()

  return {
    version: d.uint32(),
    width: d.int32(),
    height: d.int32(),
    external: d.uint32(),
    name: d.int32(),
    data: d.int32(),
  }
}

export function parseLayerQuads(layerData: ArrayBuffer, num: number): LayerQuad[] {
  const quads: LayerQuad[] = []

  const d = new DataReader(layerData)
  d.reset()

  for (let q = 0; q < num; q++) {

    const points = []
    for (let i = 0; i < 5; i++) {
      points.push({
        x: d.int32(),
        y: d.int32(),
      })
    }

    const colors: Color[] = []
    for (let i = 0; i < 4; i++) {
      colors.push({
        r: d.uint32() & 0xff,
        g: d.uint32() & 0xff,
        b: d.uint32() & 0xff,
        a: d.uint32() & 0xff
      })
    }

    const texCoords: Coord[] = []
    for (let i = 0; i < 4; i++) {
      texCoords.push({ x: d.int32(), y: d.int32() })
    }

    const quad = {
      points,
      colors,
      texCoords,
      posEnv: d.int32(),
      posEnvOffset: d.int32(),
      colorEnv: d.int32(),
      colorEnvOffset: d.int32(),
    }

    quads.push(quad)
  }

  return quads
}

export function parseLayerTiles(tileData: ArrayBuffer, num: number): LayerTile[] {
  const tiles: LayerTile[] = []
  const d = new DataReader(tileData)
  d.reset()

  for (let i = 0; i < num; i++) {
    tiles.push({
      index: d.uint8(),
      flags: d.uint8(),
    })

    // skip reserved
    d.uint8()
    d.uint8()
  }

  return tiles
}

export function parseString(data: ArrayBuffer) {
  const buf = new Uint8Array(data)

  let len = 0

  for (; len < buf.byteLength; len++)
    if (buf[len] === 0)
      break

  return String.fromCharCode.apply(null, buf.subarray(0, len))
}