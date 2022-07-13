import type { Layer } from '../twmap/layer'
import type { Texture } from './texture'

export abstract class RenderLayer {
  abstract layer: Layer
  abstract visible: boolean
  abstract texture: Texture | null

  abstract render(): void
}

