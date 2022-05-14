import { Image } from '../twmap/image'

export class TileSelector {
  tileCount: number
  selected: number

  private tilesCont: HTMLElement
  private curTile: HTMLElement
  private url: string

  constructor(cont: HTMLElement) {
    this.tileCount = 16 // tiles per row / column on texture atlas
    this.selected = 0
    this.url = ''

    cont.innerHTML = ''

    this.tilesCont = document.createElement('div')
    this.tilesCont.classList.add('tiles')
    cont.append(this.tilesCont)
    
    this.curTile = document.createElement('div')
    this.curTile.classList.add('tile', 'selected')
    cont.append(this.curTile)
    
    this.select(0)
  }
  
  setImage(image: Image | null) {
    this.tilesCont.innerHTML = ''

    if (image === null)
      return
    
    this.url = this.getImgURL(image)

    for(let i = 0; i < this.tileCount; i++) {
      for(let j = 0; j < this.tileCount; j++) {
        let $btn = this.makeButton(i, j)
        $btn.addEventListener('click', () => this.select(i * this.tileCount + j))
        this.tilesCont.append($btn)
      }
    }
    
    this.select(this.selected)
  }
  
  select(id: number) {
    this.selected = id
    this.curTile.innerHTML = ''
    this.tilesCont.classList.add('hidden')
    let row = Math.floor(id / this.tileCount)
    let col = id % this.tileCount
    let $curBtn = this.makeButton(row, col)
    $curBtn.onclick = () => this.tilesCont.classList.toggle('hidden')
    this.curTile.append($curBtn)
  }
  
  // return selected tile id on texture atlas
  getSelected() {
    return this.selected
  }
  
  private getImgURL(image: Image) {
    if (image.img !== null) {
      return image.img.src
    }
    else if (image.data instanceof ImageData) {
      let canvas = document.createElement('canvas')
      canvas.width = image.data.width
      canvas.height = image.data.height
      let ctx = canvas.getContext('2d')
      ctx.putImageData(image.data, 0, 0)
      return canvas.toDataURL()
    }
    else {
      console.warn('unsupported image data type:', image)
    }
  }
  
  private makeButton(row: number, col: number) {
    let $btn = document.createElement('button')
    $btn.style.backgroundImage = `url('${this.url}')`
    $btn.style.backgroundPositionX = '-' + col + '00%' 
    $btn.style.backgroundPositionY = '-' + row + '00%' 
    return $btn
  }
}
