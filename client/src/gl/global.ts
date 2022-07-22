import type { Shader } from './shader'
import { Viewport } from './viewport'
import { Renderer } from './renderer'

export let canvas: HTMLCanvasElement
export let gl: WebGL2RenderingContext
export let shader: Shader
export let viewport: Viewport
export let renderer: Renderer

export function init() {
  canvas = document.createElement('canvas')
  gl = canvas.getContext('webgl2', { antialias: false })
  viewport = new Viewport(canvas)
  renderer = new Renderer(gl, viewport)
  shader = renderer.shader
}
