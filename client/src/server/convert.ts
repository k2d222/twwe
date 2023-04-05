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

export function fromFixedNum(x: string): number {
  return parseFloat(x)
}
export function toFixedNum(x: number): string {
  return x.toString()
}

export function coordToJson(coord: Info.Coord): MapDir.Point<string> {
  return {
    x: toFixedNum(coord.x),
    y: toFixedNum(coord.y),
  }
}

export function coordFromJson(coord: MapDir.Point<string>): Info.Coord {
  return {
    x: fromFixedNum(coord.x),
    y: fromFixedNum(coord.y),
  }
}

export function colorToJson(coord: Info.Color): MapDir.Color<string> {
  return {
    r: toFixedNum(coord.r),
    g: toFixedNum(coord.g),
    b: toFixedNum(coord.b),
    a: toFixedNum(coord.a),
  }
}

export function colorFromJson(coord: MapDir.Color<string>): Info.Color {
  return {
    r: fromFixedNum(coord.r),
    g: fromFixedNum(coord.g),
    b: fromFixedNum(coord.b),
    a: fromFixedNum(coord.a),
  }
}
