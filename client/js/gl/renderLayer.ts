import { Layer } from '../twmap/layer'
import { QuadLayer } from '../twmap/quadLayer'

export abstract class RenderLayer {
  abstract render(): void;
}

