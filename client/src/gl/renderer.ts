import { Shader } from './shader'
import { Viewport } from './viewport'
import { RenderMap } from './renderMap'
import { TW_VERT, TW_FRAG } from './shaders'
import { mat4 } from 'gl-matrix'

export class Renderer {
  gl: WebGL2RenderingContext
  shader: Shader
  viewport: Viewport

  proj: mat4

  constructor(viewport: Viewport) {
    this.gl = viewport.gl
    this.viewport = viewport

    this.proj = mat4.create()

    this.shader = new Shader(this.gl, TW_VERT, TW_FRAG)

    this.gl.enable(this.gl.BLEND)
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA)
    this.gl.clearColor(0.5, 0.5, 0.5, 1.0)
  }

  render(map: RenderMap) {
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT)

    this.gl.activeTexture(this.gl.TEXTURE0)
    this.gl.uniform1i(this.shader.locs.unifs.uSampler, 0)

    this.gl.viewport(0, 0, this.viewport.canvas.width, this.viewport.canvas.height)
    this.updateProjMat()

    map.render()
  }

  private updateProjMat() {
    const { x1, y1, x2, y2 } = this.viewport.screen()
    mat4.ortho(this.proj, x1, x2, y2, y1, 1, -1)
    this.gl.uniformMatrix4fv(this.shader.locs.unifs.uPMatrix, false, this.proj);
  }

}

