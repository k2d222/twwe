import { RenderLayer } from "./renderLayer"
import { QuadLayer } from "../twmap/quadLayer"
import { LayerQuad } from "../twmap/types"
import { Texture } from "./texture"
import { gl, shader } from "./global"

export class RenderQuadLayer extends RenderLayer {
  layer: QuadLayer
  texture: Texture

	colorArr: Float32Array
	vertexArr: Float32Array
	texCoordArr: Float32Array
	indexArr: Uint16Array
	
	colorBuf: WebGLBuffer
	vertexBuf: WebGLBuffer
	texCoordBuf: WebGLBuffer
	indexBuf: WebGLBuffer

  constructor(layer: QuadLayer) {
    super()
    this.layer = layer

		if (this.layer.image !== null)
			this.texture = new Texture(this.layer.image)
		else
			this.texture = null
    
    const quadCount = this.layer.quads.length
		this.colorArr = new Float32Array(quadCount * 4 * 4)
		this.vertexArr = new Float32Array(quadCount * 4 * 2)
		this.texCoordArr = new Float32Array(quadCount * 4 * 2)
    this.indexArr = new Uint16Array(quadCount * 6)

		this.colorBuf = gl.createBuffer()
		this.vertexBuf = gl.createBuffer()
		this.texCoordBuf = gl.createBuffer()
		this.indexBuf = gl.createBuffer()
    this.initBuffers()
  }

  render() {
    if(!this.texture) { // textureless quad
    	gl.disableVertexAttribArray(shader.locs.attrs.aTexCoord);
    	gl.uniform1i(shader.locs.unifs.uTexCoord, 0);
    }
    else if (!this.texture.loaded) {
			this.texture.load()
    }
    else {
    	gl.enableVertexAttribArray(shader.locs.attrs.aTexCoord);
    	gl.uniform1i(shader.locs.unifs.uTexCoord, 1);
    	gl.bindTexture(gl.TEXTURE_2D, this.texture.tex);
    }

  	gl.enableVertexAttribArray(shader.locs.attrs.aVertexColor);
  	gl.uniform1i(shader.locs.unifs.uVertexColor, 1);

		gl.uniform4fv(shader.locs.unifs.uColorMask, [1.0, 1.0, 1.0, 1.0]);

  	// Set attributes
  	gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuf);
  	gl.vertexAttribPointer(shader.locs.attrs.aPosition, 2, gl.FLOAT, false, 0, 0);
	
  	gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf);
  	gl.vertexAttribPointer(shader.locs.attrs.aVertexColor, 4, gl.FLOAT, false, 0, 0);
    
    if(this.texture) {
    	gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuf);
    	gl.vertexAttribPointer(shader.locs.attrs.aTexCoord, 2, gl.FLOAT, false, 0, 0);
    }

  	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuf);
  	gl.drawElements(gl.TRIANGLES, this.layer.quads.length * 6, gl.UNSIGNED_SHORT, 0);

  	// keep textures disabled by default
  	gl.disableVertexAttribArray(shader.locs.attrs.aTexCoord);
  	gl.uniform1i(shader.locs.unifs.uTexCoord, 0);
  }
  
  private initBuffers() {
    let t = 0
    
  	for (const quad of this.layer.quads) {
      const vertices = makeVertices(quad)
      const colors = makeColors(quad)
      const texCoords = makeTexCoords(quad)
      const indices = makeIndices(t)

			this.vertexArr.set(vertices, t * 4 * 2)
			this.colorArr.set(colors, t * 4 * 4)
			this.texCoordArr.set(texCoords, t * 4 * 2)
			this.indexArr.set(indices, t * 6)
      t++
  	}

  	gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuf);
  	gl.bufferData(gl.ARRAY_BUFFER, this.vertexArr, gl.STATIC_DRAW);

  	gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf);
  	gl.bufferData(gl.ARRAY_BUFFER, this.colorArr, gl.STATIC_DRAW);

  	gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuf);
  	gl.bufferData(gl.ARRAY_BUFFER, this.texCoordArr, gl.STATIC_DRAW);

  	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuf);
  	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indexArr, gl.STATIC_DRAW);
  }
}

function makeVertices(q: LayerQuad) {
	return [
		q.points[0].x / 512 / 64, q.points[0].y / 512 / 64,
		q.points[2].x / 512 / 64, q.points[2].y / 512 / 64,
		q.points[3].x / 512 / 64, q.points[3].y / 512 / 64,
		q.points[1].x / 512 / 64, q.points[1].y / 512 / 64,
	];
}

function makeColors(q: LayerQuad) {
  const comp = ({ r, g, b, a }) => [r, g, b, a].map(x => x / 255)
	return [
    ...comp(q.colors[0]),
    ...comp(q.colors[2]),
    ...comp(q.colors[3]),
    ...comp(q.colors[1]),
	];
}

function makeTexCoords(q: LayerQuad) {
  return [
		q.texCoords[0].x / 1024, q.texCoords[0].y / 1024,
		q.texCoords[2].x / 1024, q.texCoords[2].y / 1024,
		q.texCoords[3].x / 1024, q.texCoords[3].y / 1024,
		q.texCoords[1].x / 1024, q.texCoords[1].y / 1024,
  ]
}

function makeIndices(t: number) {
  return [ 0, 1, 2, 0, 2, 3 ].map(x => x + t * 4)
}