import { LayerType } from './types'
import { Image } from './image'

export abstract class Layer {
  type: LayerType
  name: string
  abstract image: Image
  
  constructor(type: LayerType) {
    this.type = type
    this.name = 'unnamed layer'
  }
}
