import { mat4 } from "gl-matrix"

export class Viewport {
  gl: WebGL2RenderingContext
  canvas: HTMLCanvasElement
  
  pos: { x: number, y: number }                  // camera position in pixel space
  private mousePos: { x: number, y: number }     // mouse position in pixel space
  private mouseLastPos: { x: number, y: number } // mouse position at last update in pixel space
  private mouseInc: { x: number, y: number }     // mouse offset since last update in pixel space
  private mousePressed: boolean
  
  private zoom: number // zoom = 1 means 1 pixel = 1 tile

  constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
    this.gl = gl
    this.canvas = canvas

    this.pos = { x: 0, y: 0 }
    this.mousePos = { x: 0, y: 0 }
    this.mouseLastPos = { x: 0, y: 0 }
    this.mouseInc = { x: 0, y: 0 }
    this.mousePressed = false
    this.zoom = 1.0
    
    canvas.addEventListener('mousedown', this.onMouseDown.bind(this))
    canvas.addEventListener('mousemove', this.onMouseMove.bind(this))
    canvas.addEventListener('mouseup', this.onMouseUp.bind(this))
    canvas.addEventListener('wheel', this.onWheel.bind(this))
    window.addEventListener('resize', this.onResize.bind(this))
    this.onResize()
  }
  
  width() { return this.canvas.width }

  height() { return this.canvas.height }
  
  screen() {
    return {
      x: this.pos.x / this.zoom,
      y: this.pos.y / this.zoom,
      w: this.canvas.width / this.zoom,
      h: this.canvas.height / this.zoom,
    }
  }
  
  // // offset position from origin in world space  
  // worldPos() { return { x: this.pos.x, y: this.pos.y } }

  update() {
    this.pos.x += this.mouseInc.x
    this.pos.y += this.mouseInc.y

    this.mouseInc.x = 0
    this.mouseInc.y = 0
  }
  
  private onMouseDown(e: MouseEvent) {
    this.mousePos.x = e.clientX
    this.mousePos.y = e.clientY
    this.mouseInc.x = 0
    this.mouseInc.y = 0
    this.mousePressed = true
  }
  
  private onMouseUp(e: MouseEvent) {
    this.mousePressed = false
  }
  
  private onMouseMove(e: MouseEvent) {
    if(this.mousePressed) {
      this.mouseInc.x += this.mouseLastPos.x - e.clientX
      this.mouseInc.y += this.mouseLastPos.y - e.clientY
    }

    this.mouseLastPos.x = e.clientX
    this.mouseLastPos.y = e.clientY
  }
  
  private onWheel(e: WheelEvent) {
    this.zoom += e.deltaY / 100
  }
  
  private onResize() {
    this.canvas.width = window.innerWidth
    this.canvas.height = window.innerHeight
  }
}
