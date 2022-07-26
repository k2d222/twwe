import * as Info from './types'
import type { DataFile } from './datafile'
import type { Map } from './map'
import {  parseColorEnvPoint, parsePositionEnvPoint, parseSoundEnvPoint } from './parser'

export interface EnvPoint<T> {
  time: number,
  content: T,
  curve: Info.CurveType,
}

export abstract class Envelope<T> {
  type: Info.EnvType
  name: string
  synchronized: boolean
  points: EnvPoint<T>[]
  
  constructor(type: Info.EnvType) {
    this.type = type
    this.name = ''
    this.synchronized = false
    this.points = []
  }
  
  abstract load(map: Map, df: DataFile, info: Info.Envelope): void
}

export class ColorEnvelope extends Envelope<Info.Color> {
  
  constructor() {
    super(Info.EnvType.COLOR)
  }
  
  load(_map: Map, df: DataFile, info: Info.Envelope) {
    this.points = []
    this.name = info.name

    const pointsInfo = df.getType(Info.ItemType.ENVPOINTS)

    for (let p = 0; p < info.numPoints; p++) {
      const pointItem = df.getItem(pointsInfo.start + info.startPoint)
      const pointInfo = parseColorEnvPoint(pointItem.data)
      const point: EnvPoint<Info.Color> = {
        time: pointInfo.time,
        curve: pointInfo.curve,
        content: pointInfo.color,
      }
      this.points.push(point)
    }
  }
}

export class PositionEnvelope extends Envelope<Info.Coord> {
  
  constructor() {
    super(Info.EnvType.POSITION)
  }

  load(_map: Map, df: DataFile, info: Info.Envelope) {
    this.points = []
    this.name = info.name

    for (let p = 0; p < info.numPoints; p++) {
      const pointItem = df.getItem(info.startPoint + p)
      const pointInfo = parsePositionEnvPoint(pointItem.data)
      const point: EnvPoint<Info.Coord> = {
        time: pointInfo.time,
        curve: pointInfo.curve,
        content: pointInfo.pos,
      }
      this.points.push(point)
    }
  }
}

export class SoundEnvelope extends Envelope<number> {
  
  constructor() {
    super(Info.EnvType.SOUND)
  }
  
  load(_map: Map, df: DataFile, info: Info.Envelope) {
    this.points = []
    this.name = info.name

    for (let p = 0; p < info.numPoints; p++) {
      const pointItem = df.getItem(info.startPoint + p)
      const pointInfo = parseSoundEnvPoint(pointItem.data)
      const point: EnvPoint<number> = {
        time: pointInfo.time,
        curve: pointInfo.curve,
        content: pointInfo.volume,
      }
      this.points.push(point)
    }
  }
}
