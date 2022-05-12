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

		this.vertexBuf = gl.createBuffer()
		this.texCoordBuf = gl.createBuffer()

		this.createArrays()
		this.initBuffers()
  }
	
	recompute() {
    let newTileCount = RenderTileLayer.renderTileNum(this.layer.tiles)

		if (newTileCount !== this.tileCount) {
			this.tileCount = newTileCount
			this.createArrays()
		}

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

  	// keep textures disabled by default
  	gl.disableVertexAttribArray(shader.locs.attrs.aTexCoord);
  	gl.uniform1i(shader.locs.unifs.uTexCoord, 0);
  }
	
	private createArrays() {
		// TODO: this is unused ?
		this.colorFloatArray = new Float32Array([
			this.layer.color.r / 255,
			this.layer.color.g / 255,
			this.layer.color.b / 255,
			this.layer.color.a / 255
		])
		this.vertexFloatArray = new Float32Array(this.tileCount * 12)
		this.texCoordFloatArray = new Float32Array(this.tileCount * 12)
	}

	private initBuffers() {
		let t = 0

		for (let y = 0; y < this.layer.height; y++) {
			for (let x = 0; x < this.layer.width; x++) {

				let tile = this.layer.getTile(x, y)
				
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
	let tileCount = 16
	let tx = tile.index % tileCount
	let ty = Math.floor(tile.index / tileCount)

	let x0 = tx / tileCount
	let x1 = (tx + 1) / tileCount
	let x2 = x1
	let x3 = x0

	let y0 = ty / tileCount
	let y1 = (ty + 1) / tileCount
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

