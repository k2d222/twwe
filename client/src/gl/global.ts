import { Renderer } from './renderer'
import type { Shader } from './shader'
import type { Viewport } from './viewport'

export interface Context {
  renderer: Renderer
  viewport: Viewport
}

export let gl: WebGL2RenderingContext
export let shader: Shader
export let renderer: Renderer
export let viewport: Viewport

export function setContext(ctx: Context) {
  gl = ctx.renderer.gl
  shader = ctx.renderer.shader
  renderer = ctx.renderer
  viewport = ctx.viewport
}

export function getContext(): Context {
  return { renderer, viewport }
}

