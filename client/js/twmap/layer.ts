import { LayerType } from "./types"

export abstract class Layer {
  type: LayerType
  name: string
  
  constructor(type: LayerType) {
    this.type = type
    this.name = 'unnamed layer'
  }
}
