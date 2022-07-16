import type { Layer } from '../twmap/layer'
import type { Texture } from './texture'

export abstract class RenderLayer {
  abstract layer: Layer
  visible: boolean = true
  active: boolean = false
  abstract texture: Texture | null

  abstract render(): void
}

