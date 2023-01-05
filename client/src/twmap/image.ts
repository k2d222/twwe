import type { DataFile } from './datafile'
import type * as Info from './types'
import { parseString } from './parser'

export class Image {
  name: string
  width: number
  height: number
  data: TexImageSource | null
  img: HTMLImageElement | null

  constructor() {
    this.name = ''
    this.width = 0
    this.height = 0
    this.data = null
    this.img = null
  }

  loadExternal(url: string) {
    this.data = null
    this.img = document.createElement('img')
    this.img.onerror = () => console.warn('failed to load image:', url)
    this.img.onload = () => {
      this.data = this.img
      this.width = this.img.width
      this.height = this.img.height
    }
    this.img.src = url
  }

  loadEmbedded(data: ImageData) {
    this.data = data
    this.width = data.width
    this.height = data.height
    this.img = null
  }

  load(df: DataFile, info: Info.Image) {
    this.name = parseString(df.getData(info.name))
    this.width = info.width
    this.height = info.height

    if (info.external) {
      const url = '/mapres/' + this.name + '.png'
      this.loadExternal(url)
    } else {
      const buf = new Uint8ClampedArray(df.getData(info.data))
      this.data = new ImageData(buf, this.width, this.height)
    }
  }
}
