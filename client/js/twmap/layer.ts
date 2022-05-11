import { LayerType } from "./types"

export abstract class Layer {
  type: LayerType
  
  constructor(type: LayerType) {
    this.type = type
  }
}
