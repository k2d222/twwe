import { TileLayer } from "../twmap/tileLayer"
import { RenderLayer } from "./renderLayer"
import { gl, shader } from "./global"
import { LayerTile } from "../twmap/types"
import { Texture } from "./texture"
import { TileFlag } from "../twmap/types"

export class RenderTileLayer extends RenderLayer {
  layer: TileLayer
  texture: Texture | null

	colorFloatArray: Float32Array
	vertexFloatArray: Float32Array
	texCoordFloatArray: Float32Array
	
	vertexBuf: WebGLBuffer
	texCoordBuf: WebGLBuffer

  tileSize: number
  tileCount: number
  
  constructor(layer: TileLayer) {
    super()
    this.layer = layer
		
		if (layer.image !== null)
			this.texture = new Texture(layer.image)

		else
			this.texture = null
		
		this.tileSize = 32
    this.tileCount = RenderTileLayer.renderTileNum(this.layer.tiles)
		
		// TODO: this is unused ?
		this.colorFloatArray = new Float32Array([
			layer.color.r / 255,
			layer.color.g / 255,
			layer.color.b / 255,
			layer.color.a / 255
		])
		this.vertexFloatArray = new Float32Array(this.tileCount * 12)
		this.texCoordFloatArray = new Float32Array(this.tileCount * 12)
		// this.needInit = true

		this.vertexBuf = gl.createBuffer()
		this.texCoordBuf = gl.createBuffer()
		this.initBuffers()
  }

	render() {
    if(!this.texture) {
			return
    }
    else if (!this.texture.loaded) {
			this.texture.load()
			return
    }
		
  	// Enable texture
  	gl.enableVertexAttribArray(shader.locs.attrs.aTexCoord);
  	gl.uniform1i(shader.locs.unifs.uTexCoord, 1);
  	gl.bindTexture(gl.TEXTURE_2D, this.texture.tex);

  	// Vertex colors are not needed
  	gl.disableVertexAttribArray(shader.locs.attrs.aVertexColor);
  	gl.uniform1i(shader.locs.unifs.uVertexColor, 0);

  	// MapTile resize
		// TODO needed ?
  	// mat4.copy(tw.tmpMat, tw.mvMat);
  	// mat4.scale(tw.mvMat, tw.mvMat, [32, 32, 0.0]);
  	// tw.setMatUniforms();

  	// Set color mask
		let { r, g, b, a } = this.layer.color
		let col = [r, g, b, a].map(x => x / 255)
		gl.uniform4fv(shader.locs.unifs.uColorMask, col);

  	// Vertex attribute
  	gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuf);
  	gl.vertexAttribPointer(shader.locs.attrs.aPosition, 2, gl.FLOAT, false, 0, 0);

  	// Texture coord attribute
  	gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuf);
  	gl.vertexAttribPointer(shader.locs.attrs.aTexCoord, 2, gl.FLOAT, false, 0, 0);
  	gl.drawArrays(gl.TRIANGLES, 0, this.tileCount * 6);

  	// Get old mvMat
  	// mat4.copy(tw.mvMat, tw.tmpMat);

  	// keep textures disabled by default
  	gl.disableVertexAttribArray(shader.locs.attrs.aTexCoord);
  	gl.uniform1i(shader.locs.unifs.uTexCoord, 0);
  }

	private initBuffers() {
		let t = 0

		for (let y = 0; y < this.layer.height; y++) {
			for (let x = 0; x < this.layer.width; x++) {

				let tile = this.layer.tiles[y * this.layer.width + x]
				
				if (tile.index === 0) // skip tiles with index 0
					continue

				let vertices = makeVertices(x, y)
				this.vertexFloatArray.set(vertices, t * 12)

				let texCoords = makeTexCoords(tile)
				this.texCoordFloatArray.set(texCoords, t * 12)

				t++
			}
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuf)
		gl.bufferData(gl.ARRAY_BUFFER, this.vertexFloatArray, gl.STATIC_DRAW)

		gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuf)
		gl.bufferData(gl.ARRAY_BUFFER, this.texCoordFloatArray, gl.STATIC_DRAW)
	}
	
	private static renderTileNum(tiles: LayerTile[]) {
		let num = 0

		for (let tile of tiles)
			if (tile.index !== 0)
				num++
		return num
	}
}

function makeVertices(x: number, y: number) {
	return [
		x,     y,
		x,     y+1.0,
		x+1.0, y+1.0,
		x,     y,
		x+1.0, y+1.0,
		x+1.0, y
	]
}

function makeTexCoords(tile: LayerTile) {
	// mipmap border correction
	let tilePixelSize = 1024 / 32
	// TODO
	// let finalTileSize = 32 / viewport.screen().w * viewport.width()
	let finalTileSize = 32
	let finalTilesetScale = finalTileSize / tilePixelSize 

	let texSize = 1024.0
	let frac = (1.25 / texSize) * (1 / finalTilesetScale)
	let nudge = (0.5 / texSize) * (1 / finalTilesetScale)

	let tx = tile.index % 16
	let ty = Math.floor(tile.index / 16)

	let px0 = tx * (1024 / 16)
	let py0 = ty * (1024 / 16)
	let px1 = px0 + (1024 / 16) - 1
	let py1 = py0 + (1024 / 16) - 1

	let x0 = nudge + px0 / 1024 + frac
	let x1 = nudge + px1 / 1024 - frac
	let x2 = x1
	let x3 = x0

	let y0 = nudge + py0 / 1024 + frac
	let y1 = nudge + py1 / 1024 - frac
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

