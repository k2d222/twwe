import type { Image } from '../twmap/image'
import { gl } from './global'

function isPow2(x: number) {
  while (((x & 1) == 0) && x > 1)
    x >>= 1
  return (x == 1)
}

export class Texture {
  tex: WebGLTexture | null
  image: Image
  loaded: boolean
  interpolate: boolean

  constructor(image: Image, interpolate = true) {
    this.tex = null
    this.image = image
    this.loaded = false
    this.interpolate = interpolate

    if (image.data !== null)
      this.initTexture(image.data)
  }

  load() {
    if (!this.loaded && this.image.data) {
      this.initTexture(this.image.data)
    }
  }

  private initTexture(img: TexImageSource) {
    this.tex = gl.createTexture()
    const interp = this.interpolate ? gl.LINEAR : gl.NEAREST

    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)

    if (isPow2(img.width) && isPow2(img.height)) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, interp)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, interp)
    }
    else { // temporary fix for not power 2 images
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, interp)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, interp)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }

    gl.bindTexture(gl.TEXTURE_2D, null)
    this.loaded = true
  }
}
