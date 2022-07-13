import * as Info from './types'
import { DataReader } from './dataReader'

export function parseGroup(groupData: ArrayBuffer): Info.Group {
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

export function parseLayer(layerData: ArrayBuffer): Info.Layer {
  const d = new DataReader(layerData)
  d.reset()

  return {
    version: d.uint32(),
    type: d.uint32(),
    flags: d.uint32(),
  }
}

export function parseQuadsLayer(layerData: ArrayBuffer): Info.QuadsLayer {
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

export function parseTilesLayer(layerData: ArrayBuffer): Info.TilesLayer {
  const d = new DataReader(layerData)
  d.reset()

  /*obj.version =*/ d.uint32()
  /*obj.type =*/ d.uint32()
  /*obj.flags =*/ d.uint32()

  const data = {
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
    
    name: "",

    dataTele: -1,
    dataSpeedup: -1,
    dataFront: -1,
    dataSwitch: -1,
    dataTune: -1,
  }
  
  // version 3 extension
  if (data.version >= 3) {
    data.name = d.int32Str(3)
  }
  
  // ddnet extension
  if (data.flags !== Info.TilesLayerFlags.TILES && data.flags !== Info.TilesLayerFlags.GAME) {
    data.dataTele = d.int32()
    data.dataSpeedup = d.int32()
    data.dataFront = d.int32()
    data.dataSwitch = d.int32()
    data.dataTune = d.int32()
  }
  
  return data
}

export function parseImage(layerData: ArrayBuffer): Info.Image {
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

export function parseQuads(layerData: ArrayBuffer, num: number): Info.Quad[] {
  const quads: Info.Quad[] = []

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

    const colors: Info.Color[] = []
    for (let i = 0; i < 4; i++) {
      colors.push({
        r: d.uint32() & 0xff,
        g: d.uint32() & 0xff,
        b: d.uint32() & 0xff,
        a: d.uint32() & 0xff
      })
    }

    const texCoords: Info.Coord[] = []
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

export function parseTiles(tileData: ArrayBuffer, num: number): Info.Tile[] {
  const tiles: Info.Tile[] = []
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