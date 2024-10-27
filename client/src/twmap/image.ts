import type { DataFile } from './datafile'
import type * as Info from './types'
import { parseString } from './parser'

export type ImageSource = TexImageSource & { width: number; height: number }

export class Image {
  name: string
  width: number
  height: number
  data: ImageSource | null
  external: boolean

  constructor() {
    this.name = ''
    this.width = 0
    this.height = 0
    this.data = null
    this.external = false
  }

  loadExternal(url: string) {
    this.data = document.createElement('img')
    this.data.onerror = () => console.warn('failed to load image:', url)
    this.data.onload = () => {
      if (this.data) {
        this.width = this.data.width
        this.height = this.data.height
      }
    }
    this.data.src = url
    this.external = true
  }

  loadEmbedded(data: ImageData) {
    this.data = data
    this.width = data.width
    this.height = data.height
    this.external = false
  }

  load(df: DataFile, info: Info.Image) {
    this.name = parseString(df.getData(info.name))
    this.width = info.width
    this.height = info.height

    if (info.external) {
      const url = '/mapres/' + this.name + '.png'
      this.loadExternal(url)
      this.external = true
    } else {
      const buf = new Uint8ClampedArray(df.getData(info.data))
      this.data = new ImageData(buf, this.width, this.height)
      this.external = false
    }
  }
}
