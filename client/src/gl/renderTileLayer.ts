import type { TileLayer } from '../twmap/tileLayer'
import type { LayerTile } from '../twmap/types'
import type { RenderMap } from './renderMap'
import type { Texture } from './texture'
import { RenderLayer } from './renderLayer'
import { gl, shader, viewport } from './global'
import { TileFlag } from '../twmap/types'

export class RenderTileLayer extends RenderLayer {
  layer: TileLayer
  visible: boolean
  texture: Texture | null

  buffers: {
    tileCount: number,
    vertex: WebGLBuffer,
    texCoord: WebGLBuffer,
  }[][]

  chunkSize: number

  constructor(rmap: RenderMap, layer: TileLayer) {
    super()
    this.layer = layer
    this.visible = true

    this.texture = null

    if (layer.image !== null) {
      const index = rmap.map.images.indexOf(layer.image)
      this.texture  = rmap.textures[index]
    }
    else {
      this.texture = rmap.blankTexture
    }

    this.chunkSize = 64

    this.buffers = []

    this.createBuffers()
    
    if (this.texture && this.texture.loaded)
      this.initBuffers()
  }

  recomputeChunk(x: number, y: number) {
    const chunkX = Math.floor(x / this.chunkSize)
    const chunkY = Math.floor(y / this.chunkSize)
    this.initChunkBuffer(chunkX, chunkY)
  }
  
  recompute() {
    this.deleteBuffers()
    this.createBuffers()
    if (this.texture && this.texture.loaded)
      this.initBuffers()
  }

  render() {
    if (!this.visible)
      return

    if (!this.texture) {
      return
    }
    else if (!this.texture.loaded) {
      this.texture.load()
      this.initBuffers()
      return
    }

    // Enable texture
    gl.enableVertexAttribArray(shader.locs.attrs.aTexCoord)
    gl.uniform1i(shader.locs.unifs.uTexCoord, 1)
    gl.bindTexture(gl.TEXTURE_2D, this.texture.tex)

    // Vertex colors are not needed
    gl.disableVertexAttribArray(shader.locs.attrs.aVertexColor)
    gl.uniform1i(shader.locs.unifs.uVertexColor, 0)

    // Set color mask
    const { r, g, b, a } = this.layer.color
    const col = [r, g, b, a].map(x => x / 255)
    gl.uniform4fv(shader.locs.unifs.uColorMask, col)

    const { x1, x2, y1, y2 } = viewport.screen()
    const minX = Math.max(0, Math.floor(x1 / this.chunkSize))
    const minY = Math.max(0, Math.floor(y1 / this.chunkSize))
    const maxX = Math.min(this.buffers[0].length, Math.ceil(x2 / this.chunkSize))
    const maxY = Math.min(this.buffers.length, Math.ceil(y2 / this.chunkSize))
    
    for (let y = minY; y < maxY; y++) {
      for (let x = minX; x < maxX; x++) {
        const { tileCount, vertex, texCoord } = this.buffers[y][x]
        // Vertex attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, vertex)
        gl.vertexAttribPointer(shader.locs.attrs.aPosition, 2, gl.FLOAT, false, 0, 0)

        // Texture coord attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoord)
        gl.vertexAttribPointer(shader.locs.attrs.aTexCoord, 2, gl.FLOAT, false, 0, 0)
        gl.drawArrays(gl.TRIANGLES, 0, tileCount * 6)
      }
    }

    // keep textures disabled by default
    gl.disableVertexAttribArray(shader.locs.attrs.aTexCoord)
    gl.uniform1i(shader.locs.unifs.uTexCoord, 0)
  }

  private createBuffers() {
    const countX = Math.ceil(this.layer.width / this.chunkSize)
    const countY = Math.ceil(this.layer.height / this.chunkSize)

    for (let y = 0; y < countY; y++) {
      this.buffers[y] = []
      for (let x = 0; x < countX; x++) {
        this.buffers[y][x] = {
          tileCount: -1,
          vertex: gl.createBuffer(),
          texCoord: gl.createBuffer(),
        }
      }
    }
  }
  
  private deleteBuffers() {
    for (let row of this.buffers) {
      for (let buf of row) {
        gl.deleteBuffer(buf.vertex)
        gl.deleteBuffer(buf.texCoord)
      }
    }
    this.buffers = []
  }

  private chunkTileCount(chunkX: number, chunkY: number) {
    const startX = chunkX * this.chunkSize
    const startY = chunkY * this.chunkSize
    const endX = Math.min(this.layer.width, (chunkX + 1) * this.chunkSize)
    const endY = Math.min(this.layer.height, (chunkY + 1) * this.chunkSize)

    let tileCount = 0
    for (let x = startX; x < endX; x++) {
      for (let y = startY; y < endY; y++) {
        const tile = this.layer.getTile(x, y)
        if (tile.index !== 0)
          tileCount++
      }
    }

    return tileCount
  }

  private initChunkBuffer(chunkX: number, chunkY: number) {
    const startX = chunkX * this.chunkSize
    const startY = chunkY * this.chunkSize
    const endX = Math.min(this.layer.width, (chunkX + 1) * this.chunkSize)
    const endY = Math.min(this.layer.height, (chunkY + 1) * this.chunkSize)

    const buffer = this.buffers[chunkY][chunkX]

    buffer.tileCount = this.chunkTileCount(chunkX, chunkY)

    const vertexArr = new Float32Array(buffer.tileCount * 12)
    const texCoordArr = new Float32Array(buffer.tileCount * 12)
    let t = 0

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {

        const tile = this.layer.getTile(x, y)

        if (tile.index === 0) // skip tiles with index 0
          continue

        const vertices = makeVertices(x, y)
        vertexArr.set(vertices, t * 12)

        const texCoords = makeTexCoords(tile, this.texture.image.width)
        texCoordArr.set(texCoords, t * 12)

        t++
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer.vertex)
    gl.bufferData(gl.ARRAY_BUFFER, vertexArr, gl.STATIC_DRAW)

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer.texCoord)
    gl.bufferData(gl.ARRAY_BUFFER, texCoordArr, gl.STATIC_DRAW)
  }

  private initBuffers() {
    for (let y = 0; y < this.buffers.length; y++)
      for (let x = 0; x < this.buffers[0].length; x++)
        this.initChunkBuffer(x, y)
  }
}

function makeVertices(x: number, y: number) {
  return [
    x, y,
    x, y + 1.0,
    x + 1.0, y + 1.0,
    x, y,
    x + 1.0, y + 1.0,
    x + 1.0, y
  ]
}

function makeTexCoords(tile: LayerTile, atlasSize: number) {
  const tileCount = 16
  const tx = tile.index % tileCount
  const ty = Math.floor(tile.index / tileCount)
  
  // const half_pix = 0.5 / atlasSize
  const half_pix = 0

  let x0 = tx / tileCount + half_pix
  let x1 = (tx + 1) / tileCount - half_pix
  let x2 = x1
  let x3 = x0

  let y0 = ty / tileCount + half_pix
  let y1 = (ty + 1) / tileCount - half_pix
  let y2 = y1
  let y3 = y0

  // Handle tile flags
  if (tile.flags & TileFlag.HFLIP) {
    y0 = y2
    y2 = y3
    y3 = y0
    y1 = y2
  }

  if (tile.flags & TileFlag.VFLIP) {
    x0 = x1
    x2 = x3
    x3 = x0
    x1 = x2
  }

  if (tile.flags & TileFlag.ROTATE) {
    let tmp = y0
    y0 = y1
    y1 = y2
    y2 = y3
    y3 = tmp

    tmp = x0
    x0 = x3
    x3 = x1
    x1 = x2
    x2 = tmp
  }

  return [
    x0, y0,
    x3, y1,
    x1, y2,
    x0, y0,
    x1, y2,
    x2, y3,
  ]
}

