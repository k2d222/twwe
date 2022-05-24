import { gl } from './global'
import { Image } from '../twmap/image'

function isPow2(x: number) {
  while (((x & 1) == 0) && x > 1)
    x >>= 1
  return (x == 1)
}

export class Texture {
  tex: WebGLTexture
  image: Image
  loaded: boolean

  constructor(image: Image) {
    this.tex = gl.createTexture()
    this.image = image
    this.loaded = false
    if (image.data !== null)
      this.initTexture(image.data)
  }

  load() {
    if (!this.loaded && this.image.data) {
      this.initTexture(this.image.data)
      this.loaded = true
    }
  }

  private initTexture(img: TexImageSource) {

    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)

    if (isPow2(img.width) && isPow2(img.height)) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    }
    else { // temporary fix for not power 2 images
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }

    gl.bindTexture(gl.TEXTURE_2D, null)
    this.loaded = true
  }
}
