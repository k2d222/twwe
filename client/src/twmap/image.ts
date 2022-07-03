import type { DataFile } from './datafile'
import type { MapImage } from './types'
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
      console.log('loaded:', url)
      this.data = this.img
      this.width = this.img.width
      this.height = this.img.height
    }
    this.img.src = url
  }
  
  load(df: DataFile, info: MapImage) {
    this.name = parseString(df.getData(info.name))
    this.width = info.width
    this.height = info.height

    if (info.external) {
      const url = '/mapres/' + this.name + '.png'
      this.loadExternal(url)
    }
    else {
      const buf = new Uint8ClampedArray(df.getData(info.data))
      this.data = new ImageData(buf, this.width, this.height)
    }
  }
}
