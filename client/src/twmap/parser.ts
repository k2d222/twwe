import * as Info from './types'
import { DataReader } from './dataReader'

export function parseGroup(groupData: ArrayBuffer): Info.Group {
  const d = new DataReader(groupData)

  const data: Info.Group = {
    version: d.uint32(),
    offX: d.int32(),
    offY: d.int32(),
    paraX: d.int32(),
    paraY: d.int32(),
    startLayer: d.uint32(),
    numLayers: d.uint32(),
    clipping: d.uint32() === 1,

    // version 2 extension
    clipX: d.int32(),
    clipY: d.int32(),
    clipW: d.int32(),
    clipH: d.int32(),
  }
  
  // version 3 extension
  if (data.version >= 3) {
    data.name = d.int32Str(3)
  }
  
  return data
}

export function parseLayer(layerData: ArrayBuffer): Info.Layer {
  const d = new DataReader(layerData)

  return {
    version: d.uint32(),
    type: d.uint32(),
    flags: d.uint32(),
  }
}

export function parseQuadsLayer(layerData: ArrayBuffer): Info.QuadsLayer {
  const d = new DataReader(layerData)

  /*obj.version =*/ d.uint32()
  /*obj.type =*/ d.uint32()
  /*obj.flags =*/ d.uint32()

  const data: Info.QuadsLayer = {
    version: d.uint32(),
    numQuads: d.uint32(),
    data: d.int32(),
    image: d.int32(),
  }

  // version 3 extension
  if (data.version >= 2) {
    data.name = d.int32Str(3)
  }
  
  return data
}

export function parseTilesLayer(layerData: ArrayBuffer): Info.TilesLayer {
  const d = new DataReader(layerData)

  /*obj.version =*/ d.uint32()
  /*obj.type =*/ d.uint32()
  /*obj.flags =*/ d.uint32()

  const data: Info.TilesLayer = {
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

    const quad: Info.Quad = {
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

  for (let i = 0; i < num; i++) {
    tiles.push({
      id: d.uint8(),
      flags: d.uint8(),
    })

    // skip reserved
    d.uint8()
    d.uint8()
  }

  return tiles
}

export function parseTeleTiles(tileData: ArrayBuffer, num: number): Info.Tele[] {
  const tiles: Info.Tele[] = []
  const d = new DataReader(tileData)

  for (let i = 0; i < num; i++) {
    tiles.push({
      number: d.uint8(),
      id: d.uint8(),
    })
  }

  return tiles
}

export function parseSpeedupTiles(tileData: ArrayBuffer, num: number): Info.Speedup[] {
  const tiles: Info.Speedup[] = []
  const d = new DataReader(tileData)

  for (let i = 0; i < num; i++) {
    const tile = {
      force: d.uint8(),
      maxSpeed: d.uint8(),
      id: d.uint8(),
      angle: 0,
    }
    d.uint8() // skip reserved
    tile.angle = d.int16()
    tiles.push(tile)
  }

  return tiles
}

export function parseSwitchTiles(tileData: ArrayBuffer, num: number): Info.Switch[] {
  const tiles: Info.Switch[] = []
  const d = new DataReader(tileData)

  for (let i = 0; i < num; i++) {
    tiles.push({
      number: d.uint8(),
      id: d.uint8(),
      flags: d.uint8(),
      delay: d.uint8(),
    })
  }

  return tiles
}

export function parseTuneTiles(tileData: ArrayBuffer, num: number): Info.Tune[] {
  const tiles: Info.Tune[] = []
  const d = new DataReader(tileData)

  for (let i = 0; i < num; i++) {
    tiles.push({
      number: d.uint8(),
      id: d.uint8(),
    })
  }

  return tiles
}

export function parseEnvelope(envelopeData: ArrayBuffer): Info.Envelope {
  const d = new DataReader(envelopeData)

  const data: Info.Envelope = {
    version: d.uint32(),
    type: d.uint32(),
    startPoint: d.uint32(),
    numPoints: d.uint32(),
  }
  
  // extension without version change
  if (d.bytesLeft() >= 8) {
    data.name = d.int32Str(8)
  }
  
  // version 2 extension
  if (data.version >= 2) {
    data.synchronized = d.int32() === 1
  }
  
  return data
}

export function parseSoundEnvPoint(envPointData: ArrayBuffer): Info.SoundEnvPoint {
  const d = new DataReader(envPointData)

  const data = {
    time: d.uint32(),
    curve: d.uint32(),
    volume: d.int32(),
  }

  d.int32() // skip reserved
  
  return data
}

export function parsePositionEnvPoint(envPointData: ArrayBuffer): Info.PositionEnvPoint {
  const d = new DataReader(envPointData)

  const data = {
    time: d.uint32(),
    curve: d.uint32(),
    pos: {
      x: d.int32(),
      y: d.int32(),
    },
    rotation: d.int32(),
  }

  d.int32() // skip reserved
  
  return data
}

export function parseColorEnvPoint(envPointData: ArrayBuffer): Info.ColorEnvPoint {
  const d = new DataReader(envPointData)

  return {
    time: d.uint32(),
    curve: d.uint32(),
    color: {
      r: d.uint32(),
      g: d.uint32(),
      b: d.uint32(),
      a: d.uint32(),
    },
  }
}

export function parseString(data: ArrayBuffer) {
  const buf = new Uint8Array(data)

  let len = 0

  for (; len < buf.byteLength; len++)
    if (buf[len] === 0)
      break

  return String.fromCharCode.apply(null, buf.subarray(0, len))
}