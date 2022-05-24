import type { LayerType } from './types'
import type { Image } from './image'

export abstract class Layer {
  type: LayerType
  name: string
  abstract image: Image
  
  constructor(type: LayerType) {
    this.type = type
    this.name = 'unnamed layer'
  }
}
