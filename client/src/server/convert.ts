import type * as Info from '../twmap/types'
import type { CurveTypeStr, EnvPoint as JsonEnvPoint } from './protocol'
import type { EnvPoint } from '../twmap/envelope'

const curveTypeStr: CurveTypeStr[] = [ 'step', 'linear', 'slow', 'fast', 'smooth', 'bezier' ]

export function curveTypeToString(curve: Info.CurveType): CurveTypeStr {
  return curveTypeStr[curve]
}

export function curveTypeFromString(str: CurveTypeStr): Info.CurveType {
  return curveTypeStr.indexOf(str)
}

export function envPointToJson<T>(point: EnvPoint<T>): JsonEnvPoint<T> {
  return {
    time: point.time,
    content: point.content,
    type: curveTypeToString(point.type)
  }
}

export function envPointFromJson<T>(point: JsonEnvPoint<T>): EnvPoint<T> {
  return {
    time: point.time,
    content: point.content,
    type: curveTypeFromString(point.type)
  }
}