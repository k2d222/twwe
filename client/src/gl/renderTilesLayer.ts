import type { AnyTilesLayer, TilesLayer, FrontLayer, GameLayer, TeleLayer, TuneLayer, SpeedupLayer, SwitchLayer } from '../twmap/tilesLayer'
import type { RenderMap } from './renderMap'
import { RenderLayer, ViewBox } from './renderLayer'
import { gl, shader } from './global'
import { TileFlags } from '../twmap/types'
import { Image } from '../twmap/image'
import { Texture } from './texture'

export class RenderAnyTilesLayer<T extends AnyTilesLayer<{ id: number, flags?: number }>> extends RenderLayer {
  layer: T
  texture: Texture
  initialized: boolean

  buffers: {
    tileCount: number,
    vertex: WebGLBuffer,
    texCoord: WebGLBuffer,
  }[][]

  chunkSize: number

  constructor(layer: T, texture: Texture) {
    super()
    this.layer = layer
    this.texture = texture
    this.chunkSize = 64
    this.buffers = []
    this.initialized = false

    this.createBuffers()
    
    if (this.texture.loaded)
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

    if (this.texture.loaded)
      this.initBuffers()
  }
  
  protected preRender() {
    // Enable texture
    gl.enableVertexAttribArray(shader.locs.attrs.aTexCoord)
    gl.uniform1i(shader.locs.unifs.uTexCoord, 1)
    gl.bindTexture(gl.TEXTURE_2D, this.texture.tex)

    // Vertex colors are not needed
    gl.disableVertexAttribArray(shader.locs.attrs.aVertexColor)
    gl.uniform1i(shader.locs.unifs.uVertexColor, 0)
  }
  
  protected postRender() {
    // keep textures disabled by default
    gl.disableVertexAttribArray(shader.locs.attrs.aTexCoord)
    gl.uniform1i(shader.locs.unifs.uTexCoord, 0)
  }

  render(viewBox: ViewBox) {
    if (!this.visible)
      return
    
    if(!this.initialized) {
      if (this.texture.loaded)
        this.initBuffers()
      else
        this.texture.load()
      return
    }
    
    this.preRender()

    const { x1, x2, y1, y2 } = viewBox
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
    
    this.postRender()
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
    
    this.initialized = false
  }
  
  private deleteBuffers() {
    for (let row of this.buffers) {
      for (let buf of row) {
        gl.deleteBuffer(buf.vertex)
        gl.deleteBuffer(buf.texCoord)
      }
    }

    this.buffers = []
    this.initialized = false
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
        if (tile.id !== 0)
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

        if (tile.id === 0) // skip tiles with id 0
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
    this.initialized = true
  }

  private initBuffers() {
    for (let y = 0; y < this.buffers.length; y++)
      for (let x = 0; x < this.buffers[0].length; x++)
        this.initChunkBuffer(x, y)
  }
}

const fontImage: Image = (() => {
  const image = new Image()
  image.loadExternal('/editor/font.png')
  image.name = 'Font'
  return image
})()

type TextBuffer = {
  vertex: WebGLBuffer,
  texCoord: WebGLBuffer,
  tileCount: number,
}

function createTextBuffer(): TextBuffer {
  return {
    vertex: gl.createBuffer(),
    texCoord: gl.createBuffer(),
    tileCount: 0
  }
}

function textBufferInit(buffer: TextBuffer, layer: AnyTilesLayer<{ id: number, number: number }>) {
  buffer.tileCount = layer.tileCount()

  const vertexArr = new Float32Array(buffer.tileCount * 12 * 3)
  const texCoordArr = new Float32Array(buffer.tileCount * 12 * 3)
  let t = 0

  for (let y = 0; y < layer.height; y++) {
    for (let x = 0; x < layer.width; x++) {

      const tile = layer.getTile(x, y)

      if (tile.id === 0) // skip tiles with id 0
        continue

      const split = splitNumber(tile.number)
      const vertices = makeNumberVertices(x, y, split)
      vertexArr.set(vertices, t * 12 * 3)

      const texCoords = makeNumberTexCoords(split)
      texCoordArr.set(texCoords, t * 12 * 3)

      t++
    }
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer.vertex)
  gl.bufferData(gl.ARRAY_BUFFER, vertexArr, gl.STATIC_DRAW)

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer.texCoord)
  gl.bufferData(gl.ARRAY_BUFFER, texCoordArr, gl.STATIC_DRAW)
}

function textPreRender(fontTexture: Texture) {
  // Enable texture
  gl.enableVertexAttribArray(shader.locs.attrs.aTexCoord)
  gl.uniform1i(shader.locs.unifs.uTexCoord, 1)
  gl.bindTexture(gl.TEXTURE_2D, fontTexture.tex)

  // Vertex colors are not needed
  gl.disableVertexAttribArray(shader.locs.attrs.aVertexColor)
  gl.uniform1i(shader.locs.unifs.uVertexColor, 0)
}

function textPostRender() {
  // keep textures disabled by default
  gl.disableVertexAttribArray(shader.locs.attrs.aTexCoord)
  gl.uniform1i(shader.locs.unifs.uTexCoord, 0)
}

function textRender(buffer: TextBuffer, texture: Texture) {
  textPreRender(texture)

  // Vertex attribute
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer.vertex)
  gl.vertexAttribPointer(shader.locs.attrs.aPosition, 2, gl.FLOAT, false, 0, 0)

  // Texture coord attribute
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer.texCoord)
  gl.vertexAttribPointer(shader.locs.attrs.aTexCoord, 2, gl.FLOAT, false, 0, 0)

  gl.drawArrays(gl.TRIANGLES, 0, buffer.tileCount * 6 * 3)
  
  textPostRender()
}

export class RenderTilesLayer extends RenderAnyTilesLayer<TilesLayer> {
  constructor(rmap: RenderMap, layer: TilesLayer) {
    const texture = (() => {
      if (layer.image !== null) {
        const index = rmap.map.images.indexOf(layer.image)
        return rmap.textures[index]
      }
      else {
        return rmap.blankTexture
      }
    })()

    super(layer, texture)
  }
  
  preRender() {
    super.preRender()
    // Set color mask
    const { r, g, b, a } = this.layer.color
    const col = [r, g, b, a].map(x => x / 255)
    gl.uniform4fv(shader.locs.unifs.uColorMask, col)
  }
}

export class RenderFrontLayer extends RenderTilesLayer {
  static image: Image = (() => {
    const image = new Image()
    image.loadExternal('/editor/front.png')
    image.name = 'Front'
    return image
  })()

  constructor(rmap: RenderMap, layer: FrontLayer) {
    super(rmap, layer)
    this.texture = new Texture(RenderFrontLayer.image)
  }
}

export class RenderGameLayer extends RenderTilesLayer {
  static image: Image = (() => {
    const image = new Image()
    image.loadExternal('/entities/DDNet.png')
    image.name = 'Game'
    return image
  })()

  constructor(rmap: RenderMap, layer: GameLayer) {
    super(rmap, layer)
    this.texture = new Texture(RenderGameLayer.image)
  }
}

export class RenderTeleLayer extends RenderAnyTilesLayer<TeleLayer> {
  static image: Image = (() => {
    const image = new Image()
    image.loadExternal('/editor/tele.png')
    image.name = 'Tele'
    return image
  })()

  textBuffer: TextBuffer
  fontTexture: Texture

  constructor(_: RenderMap, layer: TeleLayer) {
    super(layer, new Texture(RenderTeleLayer.image))
    this.textBuffer = createTextBuffer()
    this.fontTexture = new Texture(fontImage, false)
    textBufferInit(this.textBuffer, this.layer)
  }

  recomputeChunk(x: number, y: number) {
    super.recomputeChunk(x, y)
    textBufferInit(this.textBuffer, this.layer)
  }
  
  recompute() {
    super.recompute()
    textBufferInit(this.textBuffer, this.layer)
  }

  render(viewBox: ViewBox) {
    super.render(viewBox)
    
    if (!this.fontTexture.loaded) {
      this.fontTexture.load()
      return
    }

    if (this.visible && this.active)
      textRender(this.textBuffer, this.fontTexture)
  }
}

export class RenderSpeedupLayer extends RenderAnyTilesLayer<SpeedupLayer> {
  static image: Image = (() => {
    const image = new Image()
    image.loadExternal('/editor/speedup.png')
    image.name = 'Speedup'
    return image
  })()

  textBuffer: TextBuffer
  fontTexture: Texture

  constructor(_: RenderMap, layer: SpeedupLayer) {
    super(layer, new Texture(RenderSpeedupLayer.image))
    this.textBuffer = createTextBuffer()
    this.fontTexture = new Texture(fontImage, false)
    this.initBuffer()
  }

  recomputeChunk(x: number, y: number) {
    super.recomputeChunk(x, y)
    this.initBuffer()
  }
  
  recompute() {
    super.recompute()
    this.initBuffer()
  }

  private initBuffer() {
    this.textBuffer.tileCount = this.layer.tileCount()

    const vertexArr = new Float32Array(this.textBuffer.tileCount * 12 * 3)
    const texCoordArr = new Float32Array(this.textBuffer.tileCount * 12 * 3)
    let t = 0

    for (let y = 0; y < this.layer.height; y++) {
      for (let x = 0; x < this.layer.width; x++) {

        const tile = this.layer.getTile(x, y)

        if (tile.id === 0) // skip tiles with id 0
          continue

        const split = splitNumber(tile.force)
        const vertices = makeNumberVertices(x, y, split)
        vertexArr.set(vertices, t * 12 * 3)

        const texCoords = makeNumberTexCoords(split)
        texCoordArr.set(texCoords, t * 12 * 3)

        t++
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.textBuffer.vertex)
    gl.bufferData(gl.ARRAY_BUFFER, vertexArr, gl.STATIC_DRAW)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.textBuffer.texCoord)
    gl.bufferData(gl.ARRAY_BUFFER, texCoordArr, gl.STATIC_DRAW)
  }

  render(viewBox: ViewBox) {
    super.render(viewBox)

    if (!this.fontTexture.loaded) {
      this.fontTexture.load()
      return
    }

    if (this.visible && this.active)
      textRender(this.textBuffer, this.fontTexture)
  }
}

export class RenderSwitchLayer extends RenderAnyTilesLayer<SwitchLayer> {
  static image: Image = (() => {
    const image = new Image()
    image.loadExternal('/editor/switch.png')
    image.name = 'Switch'
    return image
  })()

  textBuffer: TextBuffer
  fontTexture: Texture

  constructor(_: RenderMap, layer: SwitchLayer) {
    super(layer, new Texture(RenderSwitchLayer.image))
    this.textBuffer = createTextBuffer()
    this.fontTexture = new Texture(fontImage, false)
    textBufferInit(this.textBuffer, this.layer)
  }

  recomputeChunk(x: number, y: number) {
    super.recomputeChunk(x, y)
    textBufferInit(this.textBuffer, this.layer)
  }
  
  recompute() {
    super.recompute()
    textBufferInit(this.textBuffer, this.layer)
  }

  render(viewBox: ViewBox) {
    super.render(viewBox)

    if (!this.fontTexture.loaded) {
      this.fontTexture.load()
      return
    }

    if (this.visible && this.active)
      textRender(this.textBuffer, this.fontTexture)
  }
}

export class RenderTuneLayer extends RenderAnyTilesLayer<TuneLayer> {
  static image: Image = (() => {
    const image = new Image()
    image.loadExternal('/editor/tune.png')
    image.name = 'Tune'
    return image
  })()

  textBuffer: TextBuffer
  fontTexture: Texture

  constructor(_: RenderMap, layer: TuneLayer) {
    super(layer, new Texture(RenderTuneLayer.image))
    this.textBuffer = createTextBuffer()
    this.fontTexture = new Texture(fontImage, false)
    textBufferInit(this.textBuffer, this.layer)
  }

  recomputeChunk(x: number, y: number) {
    super.recomputeChunk(x, y)
    textBufferInit(this.textBuffer, this.layer)
  }
  
  recompute() {
    super.recompute()
    textBufferInit(this.textBuffer, this.layer)
  }

  render(viewBox: ViewBox) {
    super.render(viewBox)

    if (!this.fontTexture.loaded) {
      this.fontTexture.load()
      return
    }

    if (this.visible && this.active)
      textRender(this.textBuffer, this.fontTexture)
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

function makeTexCoords(tile: { id: number, flags?: number }, atlasSize: number) {
  const tileCount = 16
  const tx = tile.id % tileCount
  const ty = Math.floor(tile.id / tileCount)
  
  const half_pix = 0.5 / atlasSize
  // const half_pix = 0

  let x0 = tx / tileCount + half_pix
  let x1 = (tx + 1) / tileCount - half_pix
  let x2 = x1
  let x3 = x0

  let y0 = ty / tileCount + half_pix
  let y1 = (ty + 1) / tileCount - half_pix
  let y2 = y1
  let y3 = y0

  // Handle tile flags
  if (tile.flags && tile.flags & TileFlags.HFLIP) {
    y0 = y2
    y2 = y3
    y3 = y0
    y1 = y2
  }

  if (tile.flags && tile.flags & TileFlags.VFLIP) {
    x0 = x1
    x2 = x3
    x3 = x0
    x1 = x2
  }

  if (tile.flags && tile.flags & TileFlags.ROTATE) {
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

// num must be 999 <= num <= 0
function splitNumber(num: number): [number, number, number] {
  return [
    Math.floor(num / 100),     // hundreds
    Math.floor(num / 10) % 10, // tens
    num % 10,                  // ones
  ]
}

function makeNumberVertices(x: number, y: number, digits: [number, number, number]) {
  // tweaking the font appearance
  const w = 0.7
  const spacing = -0.4 // distance beetween numbers
  y -= 0.05
  x -= 0.17
  
  let verts = []
  
  for (const _ of digits) {
    verts.push(
      x, y,
      x, y + w,
      x + w, y + w,
      x, y,
      x + w, y + w,
      x + w, y
    )
    x += w + spacing
  }
  
  return verts
}

function makeNumberTexCoords(digits: [number, number, number]) {
  const tileCount = 16
  
  // number offset (0 is at x=0, y=3 on the tex atlas)
  const offX = 0
  const offY = 3
  
  const texCoords = []
  
  for (const digit of digits) {
    const tx = offX + digit
    const ty = offY

    const x0 = tx / tileCount
    const x1 = (tx + 1) / tileCount
    const y0 = ty / tileCount
    const y1 = (ty + 1) / tileCount
    
    texCoords.push(
      x0, y0,
      x0, y1,
      x1, y1,
      x0, y0,
      x1, y1,
      x1, y0
    )
  }

  return texCoords
}

