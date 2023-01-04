import type { LayerType } from './types'

export abstract class Layer {
  type: LayerType
  detail: boolean
  name: string

  constructor(type: LayerType) {
    this.type = type
    this.detail = false
    this.name = ''
  }
}
