import * as Info from './types'
import type { DataFile } from './datafile'
import type { Map } from './map'
import {  parseColorEnvPoint, parsePositionEnvPoint, parseSoundEnvPoint } from './parser'

export type EnvPos = { x: number, y: number, rotation: number }
export type EnvColor = Info.Color
export type EnvSound = number

export interface EnvPoint<T> {
  time: number,
  content: T,
  type: Info.CurveType,
}

export abstract class Envelope<T> {
  type: Info.EnvType
  name: string
  synchronized: boolean
  points: EnvPoint<T>[]
  current: { point: T, time: number }
  
  constructor(type: Info.EnvType) {
    this.type = type
    this.name = ''
    this.synchronized = false
    this.points = []
    this.current = { point: this.default(), time: 0 }
  }
  
  abstract load(map: Map, df: DataFile, info: Info.Envelope): void
  abstract default(): T
  protected abstract interpolate(from: T, to: T, factor: number): T
  
  computePoint(time: number) {
    if (!this.points.length)
      return this.default()
    
    const minTime = this.points[0].time
    const maxTime = this.points[this.points.length - 1].time
    const duration = maxTime - minTime

    // wrap time periodically between minTime and maxTime
    if (duration) {
      time = (time - minTime) % duration
      time += minTime
      if (time < 0) time = duration - time
    }
    else {
      time = minTime
    }
    
    for (let i = 0; i < this.points.length - 1; i++) {
      const p1 = this.points[i]
      const p2 = this.points[i + 1]
      if (p2.time > time) {
        const factor = (time - p1.time) / (p2.time - p1.time)
        return this.interpolate(p1.content, p2.content, this.applyCurve(factor, p1.type))
      }
    }
    
    return this.points[0].content
  }
  
  applyCurve(t: number, curve: Info.CurveType) {
    switch (curve) {
      case Info.CurveType.STEP:
        return 0
      case Info.CurveType.LINEAR:
        return t
      case Info.CurveType.SLOW:
        return Math.pow(t, 3)
      case Info.CurveType.FAST:
        return 1 - Math.pow(1 - t, 3)
      case Info.CurveType.SMOOTH:
        return t * t * (3 - 2 * t)
      case Info.CurveType.BEZIER:
        return t // TODO
    }
  }
  
  update(time: number) {
    this.current = { point: this.computePoint(time), time }
  }
}

export class ColorEnvelope extends Envelope<EnvColor> {
  
  constructor() {
    super(Info.EnvType.COLOR)
  }
  
  load(_map: Map, df: DataFile, info: Info.Envelope) {
    this.points = []
    this.name = info.name

    const itemSize = info.version <= 2 ? 6 * 4 : 22 * 4
    const pointsInfo = df.getType(Info.ItemType.ENVPOINTS)
    const pointsItem = df.getItem(pointsInfo.start)

    for (let p = info.startPoint; p < info.startPoint + info.numPoints; p++) {
      const data = pointsItem.data.slice(p * itemSize, (p + 1) * itemSize)
      const pointInfo = parseColorEnvPoint(data)
      const point: EnvPoint<EnvColor> = {
        time: pointInfo.time,
        type: pointInfo.curve,
        content: pointInfo.color,
      }
      this.points.push(point)
    }
    
    this.update(this.current.time)
  }
  
  default(): EnvColor {
    return {
      r: 0, g: 0, b: 0, a: 0
    }
  }
  
  protected interpolate(from: EnvColor, to: EnvColor, factor: number) {
    return {
      r: from.r * (1 - factor) + to.r * factor,
      g: from.g * (1 - factor) + to.g * factor,
      b: from.b * (1 - factor) + to.b * factor,
      a: from.a * (1 - factor) + to.a * factor,
    }
  }
}

export class PositionEnvelope extends Envelope<EnvPos> {
  
  constructor() {
    super(Info.EnvType.POSITION)
  }

  default(): EnvPos {
    return {
      x: 0, y: 0, rotation: 0
    }
  }
  
  load(_map: Map, df: DataFile, info: Info.Envelope) {
    this.points = []
    this.name = info.name

    const itemSize = info.version <= 2 ? 6 * 4 : 22 * 4
    const pointsInfo = df.getType(Info.ItemType.ENVPOINTS)
    const pointsItem = df.getItem(pointsInfo.start)

    for (let p = info.startPoint; p < info.startPoint + info.numPoints; p++) {
      const data = pointsItem.data.slice(p * itemSize, (p + 1) * itemSize)
      const pointInfo = parsePositionEnvPoint(data)
      const point: EnvPoint<EnvPos> = {
        time: pointInfo.time,
        type: pointInfo.curve,
        content: { x: pointInfo.x, y: pointInfo.y, rotation: pointInfo.rotation },
      }
      this.points.push(point)
    }

    this.update(this.current.time)
  }

  protected interpolate(from: EnvPos, to: EnvPos, factor: number): EnvPos {
    return {
      x: from.x * (1 - factor) + to.x * factor,
      y: from.y * (1 - factor) + to.y * factor,
      rotation: from.rotation * (1 - factor) + to.rotation * factor,
    }
  }
}

export class SoundEnvelope extends Envelope<EnvSound> {
  
  constructor() {
    super(Info.EnvType.SOUND)
  }
  
  load(_map: Map, df: DataFile, info: Info.Envelope) {
    this.points = []
    this.name = info.name

    const itemSize = info.version <= 2 ? 6 * 4 : 22 * 4
    const pointsInfo = df.getType(Info.ItemType.ENVPOINTS)
    const pointsItem = df.getItem(pointsInfo.start)

    for (let p = info.startPoint; p < info.startPoint + info.numPoints; p++) {
      const data = pointsItem.data.slice(p * itemSize, (p + 1) * itemSize)
      const pointInfo = parseSoundEnvPoint(data)
      const point: EnvPoint<number> = {
        time: pointInfo.time,
        type: pointInfo.curve,
        content: pointInfo.volume,
      }
      this.points.push(point)
    }

    this.update(this.current.time)
  }

  default(): EnvSound {
    return 0
  }

  protected interpolate(from: EnvSound, to: EnvSound, factor: number) {
    return from * (1 - factor) + to * factor
  }
}
