import type { Shader } from './shader'
import type { Viewport } from './viewport'
import { Renderer } from './renderer'

export let canvas: HTMLCanvasElement
export let gl: WebGL2RenderingContext
export let renderer: Renderer
export let shader: Shader
export let viewport: Viewport

export function init() {
  canvas = document.createElement('canvas')
  gl = canvas.getContext('webgl2', { antialias: false })
  renderer = new Renderer(gl)
  shader = renderer.shader
}

// COMBAK: this is a bit hacky
export function setViewport(vp: Viewport) {
  viewport = vp
}
