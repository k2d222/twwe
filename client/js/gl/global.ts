import { Shader } from './shader'
import { Viewport } from './viewport'
import { Renderer } from './renderer'

export let gl: WebGL2RenderingContext
export let shader: Shader
export let viewport: Viewport
export let renderer: Renderer

export function init(canvas: HTMLCanvasElement) {
  gl = canvas.getContext('webgl2', { antialias: false })
  viewport = new Viewport(gl, canvas)
  renderer = new Renderer(viewport)
  shader = renderer.shader
}
