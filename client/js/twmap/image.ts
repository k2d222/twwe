import { DataFile } from "./datafile";
import { MapImage } from "./types";
import { parseString } from "./parser";


export class Image {
  name: string
  width: number
  height: number
  data: TexImageSource | null
	
	constructor() {
		this.name = "unnamed image"
		this.width = 0
		this.height = 0
		this.data = null
	}
	
	loadExternal(url: string) {
		let img = document.createElement('img')
		img.onerror = () => console.warn('failed to load image:', url)
		img.onload = () => {
			console.log('loaded:', url)
			this.data = img
			this.width = img.width
			this.height = img.height
		}
		img.src = url
	}
	
  load(df: DataFile, info: MapImage) {
		this.name = parseString(df.getData(info.name))
    this.width = info.width
    this.height = info.height
    
		if (info.external) {
			let url = 'mapres/' + this.name + '.png'
			this.loadExternal(url)
		}
    else {
			let buf = new Uint8ClampedArray(df.getData(info.data))
      this.data = new ImageData(buf, this.width, this.height)
    }
  }
}
