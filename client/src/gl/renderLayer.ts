import type { Layer } from '../twmap/layer'

export abstract class RenderLayer {
  abstract layer: Layer
  abstract visible: boolean

  abstract render(): void
}

