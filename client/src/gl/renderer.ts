import type { Viewport } from './viewport'
import type { RenderMap } from './renderMap'
import { Shader } from './shader'
import { TW_VERT, TW_FRAG } from './shaders'
import { mat4 } from 'gl-matrix'

export class Renderer {
  gl: WebGL2RenderingContext | WebGLRenderingContext
  shader: Shader
  proj: mat4

  constructor(canvas: HTMLCanvasElement) {
    this.gl = canvas.getContext('webgl', { antialias: false })!

    this.proj = mat4.create()

    this.shader = new Shader(this.gl, TW_VERT, TW_FRAG)

    this.gl.enable(this.gl.BLEND)
    this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA)
    this.gl.clearColor(0.0, 0.0, 0.0, 0.0)
  }

  render(viewport: Viewport, rmap: RenderMap) {
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)

    this.gl.activeTexture(this.gl.TEXTURE0)
    this.gl.uniform1i(this.shader.locs.unifs.uSampler, 0)

    this.gl.viewport(0, 0, viewport.canvas.width, viewport.canvas.height)
    this.updateProjMat(viewport)

    rmap.render()
  }

  private updateProjMat(viewport: Viewport) {
    const { x1, y1, x2, y2 } = viewport.screen()
    mat4.ortho(this.proj, x1, x2, y2, y1, 1, -1)
    this.gl.uniformMatrix4fv(this.shader.locs.unifs.uPMatrix, false, this.proj)
  }
}
