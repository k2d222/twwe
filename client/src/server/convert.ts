import type * as Info from '../twmap/types'
import type * as MapDir from '../twmap/mapdir'
import type { CurveTypeStr } from './protocol'

const curveTypeStr: CurveTypeStr[] = ['step', 'linear', 'slow', 'fast', 'smooth', 'bezier']

export function curveTypeToString(curve: Info.CurveType): CurveTypeStr {
  return curveTypeStr[curve]
}

export function curveTypeFromString(str: CurveTypeStr): Info.CurveType {
  return curveTypeStr.indexOf(str)
}

export function fromFixedNum(x: string, floating: number): number {
  return parseFloat(x) * Math.pow(2, floating)
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
