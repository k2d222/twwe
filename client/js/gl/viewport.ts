import { mat4 } from "gl-matrix"

type Vec2 = { x: number, y: number  }

export class Viewport {
  gl: WebGL2RenderingContext
  canvas: HTMLCanvasElement
  
  
  // note on the coordinates systems:
  //  - all origins are top-left corner, x grows to the left and y down.
  //  - the pixel space correspond to on-screen pixels and may be equal
  //    canvas space, depending on the canvas resolution.
  //  - the canvas space is the coordinate system of the canvas context.
  //  - the world space is indexed by tiles i.e. 1 unit = 1 tile.
  //  - the tile space world space but with integers.

  // following variables are in world space.
  pos: Vec2
  posDragStart: Vec2
  posDragLast: Vec2
  mouseHover: boolean

  dragTimestamp: number
  touchDistance: number
  
  // scale is ratio between canvas space and world space.
  scale: number
  minScale: number
  maxScale: number
  
  constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
    this.gl = gl
    this.canvas = canvas
    
    this.pos = { x: 0, y: 0 }
    this.posDragStart = { x: 0, y: 0 }
    this.posDragLast = { x: 0, y: 0 }
    this.mouseHover = false

    this.scale = 16
    this.minScale = 1
    this.maxScale = 100
    
    this.createListeners()
    this.onresize()
  }
  
  // return the screen dimensions in the world space. 
  screen() {
    let [ x1, y1 ] = this.canvasToWorld(0, 0)
    let [ x2, y2 ] = this.canvasToWorld(this.canvas.width, this.canvas.height)
    return { x1, y1, x2, y2 }
  }
  
  private createListeners() {
    this.canvas.addEventListener('click', (e) => this.onclick(e))
    
    let mousemove = (e: MouseEvent) => this.onmousemove(e)
    
    let mousedown = (e: MouseEvent) => {
      this.onmousedown(e)
      this.canvas.addEventListener('mousemove', mousemove)
    }
    
    let mouseup = () => {
      this.canvas.removeEventListener('mousemove', mousemove)
    }
    
    let wheel = (e: WheelEvent) => this.onwheel(e)

    this.canvas.addEventListener('touchstart', this.ontouchstart.bind(this))
    this.canvas.addEventListener('touchmove', this.ontouchmove.bind(this))
    this.canvas.addEventListener('mousedown', mousedown)
    this.canvas.addEventListener('mouseup', mouseup)
    this.canvas.addEventListener('wheel', wheel)

    // TODO
    // this.canvas.addEventListener('mouseenter', () => this.mouseHover = true)
    // this.canvas.addEventListener('mouseleave', () => hover = false)
    // this.canvas.addEventListener('mousemove', (e) => {
    //   x = e.clientX
    //   y = e.clientY
    // })
  }

  // this is probably a noop, because canvas is sized to window size
  pixelToCanvas(x: number, y: number) {
    return [
      x / this.canvas.clientWidth * this.canvas.width,
      y / this.canvas.clientHeight * this.canvas.height,
    ]
  }

  canvasToWorld(x: number, y: number) {
    return [
      this.pos.x + x / this.scale,
      this.pos.y + y / this.scale,
    ]
  }

  pixelToWorld(x: number, y: number) {
    let [ x2, y2 ] = this.pixelToCanvas(x, y)
    return this.canvasToWorld(x2, y2)
  }

  // private canvasToGrid(x: number, y: number) {
  //   return [
  //     Math.floor((this.pos.x + x / this.scale) / this.grid.tileSize),
  //     Math.floor((this.pos.y + y / this.scale) / this.grid.tileSize),
  //   ]
  // }

  // ------------ window events --------------------------------
  // private onkeydown(e: KeyboardEvent) {
  //     if( !hover ) return
  //     if(e.key === ' ') {
  //       this.onSpacebar(x, y)
  //     }
  //     else if(e.key === '+') {
  //       this.onZoom(.5, x, y)
  //     }
  //     else if(e.key === '-') {
  //       this.onZoom(-.5, x, y)
  //     }
  // }

  private onresize() {
    this.canvas.width = window.innerWidth
    this.canvas.height = window.innerHeight
  }


  // ------------ desktop events --------------------------------
  private onmousedown(e: MouseEvent) {
    let [ canvasX, canvasY ] = this.pixelToCanvas(e.clientX, e.clientY)
    this.onDragStart(canvasX, canvasY)
  }

  private onmousemove(e: MouseEvent) {
    let [ canvasX, canvasY ] = this.pixelToCanvas(e.clientX, e.clientY)
    this.onDrag(canvasX, canvasY)
  }

  private onwheel(e: WheelEvent) {
    let direction = e.deltaY < 0 ? -1 : 1
    this.onZoom(0.1 * direction, e.clientX, e.clientY)
  }

  private onclick(e: MouseEvent) {
    let [ canvasX, canvasY ] = this.pixelToCanvas(e.clientX, e.clientY)
    if(Math.abs(this.posDragStart.x - canvasX) > 5 || Math.abs(this.posDragStart.y - canvasY) > 5) return
    // let [ gridX, gridY ] = this.canvasToGrid(canvasX, canvasY)
  }

  private onSpacebar(x: number, y: number) {
    // let [ canvasX, canvasY ] = this.pixelToCanvas(x, y)
    // let [ gridX, gridY ] = this.canvasToGrid(canvasX, canvasY)
  }


  // ------------ mobile events --------------------------------
  private ontouchstart(e: TouchEvent) {
    if(e.touches.length === 1) {
      let [ canvasX, canvasY ] = this.pixelToCanvas(e.touches[0].clientX, e.touches[0].clientY)
      this.onDragStart(canvasX, canvasY)
    }
    else if(e.touches.length === 2) {
      let distX = e.touches[0].clientX - e.touches[1].clientX
      let distY = e.touches[0].clientY - e.touches[1].clientY
      this.touchDistance = Math.sqrt(distX*distX + distY*distY)
    }
  }

  private ontouchmove(e: TouchEvent) {
    e.preventDefault()
    if(e.touches.length === 1) {
      let [ canvasX, canvasY ] = this.pixelToCanvas(e.touches[0].clientX, e.touches[0].clientY)
      this.onDrag(canvasX, canvasY)
    }
    else if(e.touches.length === 2) {
      let posX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      let posY = (e.touches[0].clientY + e.touches[1].clientY) / 2
      let distX = e.touches[0].clientX - e.touches[1].clientX
      let distY = e.touches[0].clientY - e.touches[1].clientY
      let distance = Math.sqrt(distX*distX + distY*distY)
      let delta = (distance / this.touchDistance) - 1
      if(delta === 0) return
      this.onZoom(delta, posX, posY)
      this.touchDistance = distance
    }
  }

  // ------------------------------------------------------------
  private onZoom(factor: number, clientX: number, clientY: number) {

    let delta = factor * this.scale

    if(this.scale + delta > this.maxScale) delta = this.maxScale - this.scale
    if(this.scale + delta < this.minScale) delta = this.minScale - this.scale

    let [ canvasX, canvasY ] = this.pixelToCanvas(clientX, clientY)

    let zoom = (this.scale + delta) / this.scale

    this.onMove(
      canvasX / this.scale - canvasX / (this.scale*zoom),
      canvasY / this.scale - canvasY / (this.scale*zoom)
    )

    this.scale += delta
  }

  private onDragStart(x: number, y: number) {
    this.posDragStart.x = x
    this.posDragStart.y = y
    this.posDragLast.x = this.posDragStart.x
    this.posDragLast.y = this.posDragStart.y
    this.dragTimestamp = Date.now()
  }

  private onDrag(x: number, y: number) {
    if(Date.now() - this.dragTimestamp < 100) return

    let deltaX = x - this.posDragLast.x
    let deltaY = y - this.posDragLast.y

    this.posDragLast.x = x
    this.posDragLast.y = y

    this.onMove( -deltaX / this.scale, -deltaY / this.scale )
  }

  onMove(dx: number, dy: number) {
    this.pos.x += dx
    this.pos.y += dy
    // this.pos.x = this.pos.x % this.grid.canvas.width
    // this.pos.y = this.pos.y % this.grid.canvas.height
    // if(this.pos.x < 0) this.pos.x = this.grid.canvas.width + this.pos.x
    // if(this.pos.y < 0) this.pos.y = this.grid.canvas.height + this.pos.y
  }

}
