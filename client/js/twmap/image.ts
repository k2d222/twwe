import { DataFile } from "./datafile";
import { MapImage } from "./types";
import { parseString } from "./parser";


export class Image {
  name: string
  width: number
  height: number
  data: ImageData | null
	
	constructor() {
		this.name = "unnamed image"
		this.width = 0
		this.height = 0
		this.data = null
	}
  
  load(df: DataFile, info: MapImage) {
		this.name = parseString(df.getData(info.name))
    this.width = info.width
    this.height = info.height
    
		if (info.external) {
			// let url = this.name + ".png"
			console.warn('external images are not supported yet.')
		}
    else {
			let buf = new Uint8ClampedArray(df.getData(info.data))
      this.data = new ImageData(buf, this.width, this.height)
			
   //    this is debug			
      // let canvas = document.createElement('canvas');
      // let ctx = canvas.getContext('2d');
      // canvas.width = this.data.width;
      // canvas.height = this.data.height;
      // ctx.putImageData(this.data, 0, 0);
      // let image = document.createElement('img');
      // image.src = canvas.toDataURL();
      // document.body.append(image)

    }
  }
}
