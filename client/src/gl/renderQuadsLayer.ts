import type { QuadsLayer } from '../twmap/quadsLayer'
import type * as Info from '../twmap/types'
import type { Texture } from './texture'
import type { RenderMap } from './renderMap'
import { RenderLayer } from './renderLayer'
import { gl, shader } from './global'

export class RenderQuadsLayer extends RenderLayer {
  layer: QuadsLayer
  texture: Texture

  colorBuf: WebGLBuffer
  vertexBuf: WebGLBuffer
  texCoordBuf: WebGLBuffer
  indexBuf: WebGLBuffer

  constructor(rmap: RenderMap, layer: QuadsLayer) {
    super()
    this.layer = layer
    
    this.texture = null

    if (layer.image !== null) {
      const index = rmap.map.images.indexOf(layer.image)
      this.texture = rmap.textures[index]
    }

    this.colorBuf = gl.createBuffer()
    this.vertexBuf = gl.createBuffer()
    this.texCoordBuf = gl.createBuffer()
    this.indexBuf = gl.createBuffer()
    this.initBuffers()
  }
  
  recompute() {
    gl.deleteBuffer(this.colorBuf)
    gl.deleteBuffer(this.vertexBuf)
    gl.deleteBuffer(this.texCoordBuf)
    gl.deleteBuffer(this.indexBuf)

    this.colorBuf = gl.createBuffer()
    this.vertexBuf = gl.createBuffer()
    this.texCoordBuf = gl.createBuffer()
    this.indexBuf = gl.createBuffer()

    this.initBuffers()
  }

  render() {
    if (!this.visible)
      return

    if (!this.texture) { // textureless quad
      gl.disableVertexAttribArray(shader.locs.attrs.aTexCoord)
      gl.uniform1i(shader.locs.unifs.uTexCoord, 0)
    }
    else if (!this.texture.loaded) {
      this.texture.load()
    }
    else {
      gl.enableVertexAttribArray(shader.locs.attrs.aTexCoord)
      gl.uniform1i(shader.locs.unifs.uTexCoord, 1)
      gl.bindTexture(gl.TEXTURE_2D, this.texture.tex)
    }

    gl.enableVertexAttribArray(shader.locs.attrs.aVertexColor)
    gl.uniform1i(shader.locs.unifs.uVertexColor, 1)

    gl.uniform4fv(shader.locs.unifs.uColorMask, [1.0, 1.0, 1.0, 1.0])

    // Set attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuf)
    gl.vertexAttribPointer(shader.locs.attrs.aPosition, 2, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf)
    gl.vertexAttribPointer(shader.locs.attrs.aVertexColor, 4, gl.FLOAT, false, 0, 0)

    if (this.texture) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuf)
      gl.vertexAttribPointer(shader.locs.attrs.aTexCoord, 2, gl.FLOAT, false, 0, 0)
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuf)
    gl.drawElements(gl.TRIANGLES, this.layer.quads.length * 6, gl.UNSIGNED_SHORT, 0)

    // keep textures disabled by default
    gl.disableVertexAttribArray(shader.locs.attrs.aTexCoord)
    gl.uniform1i(shader.locs.unifs.uTexCoord, 0)
  }

  private initBuffers() {
    const quadCount = this.layer.quads.length
    const colorArr = new Float32Array(quadCount * 4 * 4)
    const vertexArr = new Float32Array(quadCount * 4 * 2)
    const texCoordArr = new Float32Array(quadCount * 4 * 2)
    const indexArr = new Uint16Array(quadCount * 6)

    let t = 0

    for (const quad of this.layer.quads) {
      const vertices = makeVertices(quad)
      const colors = makeColors(quad)
      const texCoords = makeTexCoords(quad)
      const indices = makeIndices(t)

      vertexArr.set(vertices, t * 4 * 2)
      colorArr.set(colors, t * 4 * 4)
      texCoordArr.set(texCoords, t * 4 * 2)
      indexArr.set(indices, t * 6)
      t++
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuf)
    gl.bufferData(gl.ARRAY_BUFFER, vertexArr, gl.STATIC_DRAW)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf)
    gl.bufferData(gl.ARRAY_BUFFER, colorArr, gl.STATIC_DRAW)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuf)
    gl.bufferData(gl.ARRAY_BUFFER, texCoordArr, gl.STATIC_DRAW)

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuf)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArr, gl.STATIC_DRAW)
  }
}

function makeVertices(q: Info.Quad) {
  return [
    q.points[0].x / 512 / 64, q.points[0].y / 512 / 64,
    q.points[2].x / 512 / 64, q.points[2].y / 512 / 64,
    q.points[3].x / 512 / 64, q.points[3].y / 512 / 64,
    q.points[1].x / 512 / 64, q.points[1].y / 512 / 64,
  ]
}

function makeColors(q: Info.Quad) {
  const comp = ({ r, g, b, a }) => [r, g, b, a].map(x => x / 255)
  return [
    ...comp(q.colors[0]),
    ...comp(q.colors[2]),
    ...comp(q.colors[3]),
    ...comp(q.colors[1]),
  ]
}

function makeTexCoords(q: Info.Quad) {
  return [
    q.texCoords[0].x / 1024, q.texCoords[0].y / 1024,
    q.texCoords[2].x / 1024, q.texCoords[2].y / 1024,
    q.texCoords[3].x / 1024, q.texCoords[3].y / 1024,
    q.texCoords[1].x / 1024, q.texCoords[1].y / 1024,
  ]
}

function makeIndices(t: number) {
  return [0, 1, 2, 0, 2, 3].map(x => x + t * 4)
}