export const AttributeLocations = [
	"aPosition",
	"aVertexColor",
	"aTexCoord",
] as const

export const UniformLocations = [
	"uPMatrix",
	"uMVMatrix",
	"uSampler",
	"uColorMask",
	"uTexCoord",
	"uVertexColor",
] as const

type ProgLocations = {
	attrs: { [k in typeof AttributeLocations[number]]: number },
	unifs: { [k in typeof UniformLocations[number]]: WebGLUniformLocation },
}

export class Shader {
	prog: WebGLProgram
	vert: WebGLShader
	frag: WebGLShader
	locs: ProgLocations

	constructor(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string) {
		this.prog = gl.createProgram()
		this.vert = Shader.makeShader(gl, vertSrc, gl.VERTEX_SHADER)
		this.frag = Shader.makeShader(gl, fragSrc, gl.FRAGMENT_SHADER)

		gl.attachShader(this.prog, this.frag)
		gl.attachShader(this.prog, this.vert)
		gl.linkProgram(this.prog)
		gl.useProgram(this.prog)
		this.locs = this.initLocations(gl)
		this.initAttributes(gl);
		this.initUniforms(gl);
	}
	
	private initLocations(gl: WebGL2RenderingContext) {
		const locs: ProgLocations = {
			attrs: {
				aPosition: gl.getAttribLocation(this.prog, "aPosition"),
				aVertexColor: gl.getAttribLocation(this.prog, "aVertexColor"),
				aTexCoord: gl.getAttribLocation(this.prog, "aTexCoord"),
			},
			unifs: {
				uPMatrix: gl.getUniformLocation(this.prog, "uPMatrix"),
				uMVMatrix: gl.getUniformLocation(this.prog, "uMVMatrix"),
				uSampler: gl.getUniformLocation(this.prog, "uSampler"),
				uColorMask: gl.getUniformLocation(this.prog, "uColorMask"),
				uTexCoord: gl.getUniformLocation(this.prog, "uTexCoord"),
				uVertexColor: gl.getUniformLocation(this.prog, "uVertexColor"),
			}
		}
		return locs
	}
	
	private initAttributes(gl: WebGL2RenderingContext) {
		gl.enableVertexAttribArray(this.locs.attrs.aPosition);
	}

	private initUniforms(gl: WebGL2RenderingContext) {
		gl.uniform4fv(this.locs.unifs.uColorMask, [1.0, 1.0, 1.0, 1.0])
		gl.uniform1i(this.locs.unifs.uTexCoord, 0)
		gl.uniform1i(this.locs.unifs.uVertexColor, 0)
	}
		
	private static makeShader(gl: WebGL2RenderingContext, src: string, typ: number) {
		const shader = gl.createShader(typ)
		gl.shaderSource(shader, src)
		gl.compileShader(shader)
		return shader
	}
}
