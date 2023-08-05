import type { Layer } from '../twmap/layer'
import type { Texture } from './texture'

export type ViewBox = { x1: number; x2: number; y1: number; y2: number }

export abstract class RenderLayer {
  abstract layer: Layer
  visible: boolean = true
  active: boolean = false
  abstract texture: Texture | null

  abstract render(viewport: ViewBox): void
  abstract recompute(): void
}
