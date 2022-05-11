import { RenderLayer } from "./renderLayer"
import { QuadLayer } from "../twmap/quadLayer"

export class RenderQuadLayer extends RenderLayer {
  layer: QuadLayer

  constructor(layer: QuadLayer) {
    super()    
    this.layer = layer
  }

  render() {
    console.log('TODO render quadlayer')
  }
}
