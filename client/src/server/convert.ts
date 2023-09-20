import * as Info from '../twmap/types'
import * as MapDir from '../twmap/mapdir'
import * as Parser from '../twmap/parser'

const curveTypeStr: MapDir.CurveType[] = [
  MapDir.CurveType.Step,
  MapDir.CurveType.Linear,
  MapDir.CurveType.Slow,
  MapDir.CurveType.Fast,
  MapDir.CurveType.Smooth,
  MapDir.CurveType.Bezier,
]

export function curveTypeToString(curve: Info.CurveType): MapDir.CurveType {
  return curveTypeStr[curve]
}

export function curveTypeFromString(str: MapDir.CurveType): Info.CurveType {
  return curveTypeStr.indexOf(str)
}

export function fromFixedNum(x: string, floating: number): number {
  return Math.round(parseFloat(x) * Math.pow(2, floating))
}
export function toFixedNum(x: number, floating: number): string {
  return (x / Math.pow(2, floating)).toString()
}

export function coordToJson(coord: Info.Coord, floating: number): MapDir.Point<string> {
  return {
    x: toFixedNum(coord.x, floating),
    y: toFixedNum(coord.y, floating),
  }
}

export function coordFromJson(coord: MapDir.Point<string>, floating: number): Info.Coord {
  return {
    x: fromFixedNum(coord.x, floating),
    y: fromFixedNum(coord.y, floating),
  }
}

export function uvToJson(uv: Info.Coord, floating: number): MapDir.Uv<string> {
  return {
    u: toFixedNum(uv.x, floating),
    v: toFixedNum(uv.y, floating),
  }
}

export function uvFromJson(uv: MapDir.Uv<string>, floating: number): Info.Coord {
  return {
    x: fromFixedNum(uv.u, floating),
    y: fromFixedNum(uv.v, floating),
  }
}

export function colorToJson(coord: Info.Color, floating: number): MapDir.Color<string> {
  return {
    r: toFixedNum(coord.r, floating),
    g: toFixedNum(coord.g, floating),
    b: toFixedNum(coord.b, floating),
    a: toFixedNum(coord.a, floating),
  }
}

export function colorFromJson(coord: MapDir.Color<string>, floating: number): Info.Color {
  return {
    r: fromFixedNum(coord.r, floating),
    g: fromFixedNum(coord.g, floating),
    b: fromFixedNum(coord.b, floating),
    a: fromFixedNum(coord.a, floating),
  }
}

// see https://developer.mozilla.org/en-US/docs/Glossary/Base64
export function base64ToBytes(base64: string): Uint8Array {
  const binString = window.atob(base64);
  return Uint8Array.from(binString, (m) => m.codePointAt(0));
}

export function bytesToBase64(bytes: Uint8Array): string {
  const binString = Array.from(bytes, (x) => String.fromCodePoint(x)).join("");
  return window.btoa(binString);
}

export function tilesToData(tiles: Info.AnyTile[]): string {
  let arr = []

  for (const tile of tiles) {
    if ('force' in tile) { // speedup
      arr.push(tile.force, tile.maxSpeed, tile.id, 0, tile.angle & 0xff, (tile.angle >> 8) & 0xff) // little endian for angle
    }
    else if ('delay' in tile) { // switch
      arr.push(tile.number, tile.id, tile.flags, tile.delay)
    }
    else if ('flags' in tile) { // tiles | game | front
      arr.push(tile.id, tile.flags, 0, 0)
    }
    else if ('number' in tile) { // tele | tune
      arr.push(tile.number, tile.id)
    }
    else {
      throw 'unsupported tile type'
    }
  }

  return bytesToBase64(new Uint8Array(arr))
}

// export function tileToData(tile: EditTileParams): string {
//   return tilesToData([tile])
// }

export function dataToTiles(data: string, kind: MapDir.LayerKind): Info.AnyTile[] {
  const arr = base64ToBytes(data).buffer

  if (kind === 'tiles' || kind === 'game' || kind === 'front') {
    return Parser.parseTiles(arr, arr.byteLength / 4)
  }
  else if (kind === 'tele') {
    return Parser.parseTeleTiles(arr, arr.byteLength / 2)
  }
  else if (kind === 'speedup') {
    return Parser.parseSpeedupTiles(arr, arr.byteLength / 6)
  }
  else if (kind === 'switch') {
    return Parser.parseSwitchTiles(arr, arr.byteLength / 4)
  }
  else if (kind === 'tune') {
    return Parser.parseTuneTiles(arr, arr.byteLength / 2)
  }
  else {
    throw 'unsupported tile type ' + kind
  }
}

export function tilesLayerFlagsToLayerKind(flags: Info.TilesLayerFlags) {
  if (flags === Info.TilesLayerFlags.FRONT) return MapDir.LayerKind.Front
  else if (flags === Info.TilesLayerFlags.GAME) return MapDir.LayerKind.Game
  else if (flags === Info.TilesLayerFlags.SPEEDUP) return MapDir.LayerKind.Speedup
  else if (flags === Info.TilesLayerFlags.SWITCH) return MapDir.LayerKind.Switch
  else if (flags === Info.TilesLayerFlags.TELE) return MapDir.LayerKind.Tele
  else if (flags === Info.TilesLayerFlags.TILES) return MapDir.LayerKind.Tiles
  else if (flags === Info.TilesLayerFlags.TUNE) return MapDir.LayerKind.Tune
}

export function layerKindToTilesLayerFlags(kind: MapDir.LayerKind) {
  if (kind === MapDir.LayerKind.Front) return Info.TilesLayerFlags.FRONT
  else if (kind === MapDir.LayerKind.Game) return Info.TilesLayerFlags.GAME
  else if (kind === MapDir.LayerKind.Speedup) return Info.TilesLayerFlags.SPEEDUP
  else if (kind === MapDir.LayerKind.Switch) return Info.TilesLayerFlags.SWITCH
  else if (kind === MapDir.LayerKind.Tele) return Info.TilesLayerFlags.TELE
  else if (kind === MapDir.LayerKind.Tiles) return Info.TilesLayerFlags.TILES
  else if (kind === MapDir.LayerKind.Tune) return Info.TilesLayerFlags.TUNE
  else throw "not a tile layer"
}

export function resIndexToString(index: number, name: string): string {
  if (name === '') {
    return index + ''
  }
  else {
    return `${index}_${name}`
  }
}

export function stringToResIndex(str: string): [number, string] {
  const underscore = str.indexOf('_')
  if (underscore === -1) {
    return [parseInt(str.slice(0, underscore)), str.slice(underscore + 1)]
  }
}
