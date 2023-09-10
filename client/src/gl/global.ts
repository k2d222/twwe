import type { Shader } from './shader'
import { Viewport } from './viewport'
import { Renderer } from './renderer'

export interface Context {
  canvas: HTMLCanvasElement
  gl: WebGL2RenderingContext
  renderer: Renderer
  shader: Shader
  viewport: Viewport
}

export let canvas: HTMLCanvasElement
export let gl: WebGL2RenderingContext
export let renderer: Renderer
export let shader: Shader
export let viewport: Viewport

export function createContext(): Context {
  const cont = document.createElement('div')
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2', { antialias: false })
  const renderer = new Renderer(gl)
  const shader = renderer.shader
  const viewport = new Viewport(cont, canvas)
  return { canvas, gl, renderer, shader, viewport }
}

export function setContext(ctx: Context) {
  canvas = ctx.canvas
  gl = ctx.gl
  renderer = ctx.renderer
  shader = ctx.shader
  viewport = ctx.viewport
}

export function getContext(): Context {
  return { canvas, gl, renderer, shader, viewport }
}

export function init() {
  const ctx = createContext()
  setContext(ctx)
}
