import { DataFile } from "./datafile";
import { MapImage } from "./types";
import { parseString } from "./parser";


export class Image {
  name: string
  width: number
  height: number
  image: HTMLImageElement
  
  load(df: DataFile, info: MapImage) {
		this.name = parseString(df.getData(info.imageName))
    this.width = info.width
    this.height = info.height
    
    let url: string

		if (info.external) {
			url = this.name + ".png"
		}
    else {
			let buf = new Uint8ClampedArray(df.getData(info.imageData))
      let img = new ImageData(buf, this.width, this.height)

      let canvas = document.createElement("canvas")
      canvas.width = 100
      canvas.height = 100
      let ctx = canvas.getContext("2d")
      ctx.putImageData(img, 0, 0)
      url = canvas.toDataURL("image/png")
    }

    this.image = document.createElement('img')
    this.image.src = url
  }
}
