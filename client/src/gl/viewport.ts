type Vec2 = { x: number; y: number }

export class Viewport {
  canvas: HTMLCanvasElement
  cont: HTMLElement

  // note on the coordinates systems:
  //  - all origins are top-left corner, x grows to the left and y down.
  //  - the pixel space correspond to on-screen pixels, origin is the
  //    window viewport (top-left)
  //  - the canvas space is the coordinate system of the canvas context.
  //  - the world space is indexed by tiles i.e. 1 unit = 1 tile.
  //  - the tile space is world space but with integers (tile indices).

  // following variables are in world space.
  pos: Vec2 // pos of the view top-left corner
  posDragStart: Vec2 // top-left corner when drag started
  posDragLast: Vec2 // top-left corner last frame
  mousePos: Vec2 // mouse world position when hover the canvas

  clickTimeout: number // millis between press and release to be considered click

  dragTimestamp: number
  touchDistance: number

  // scale is ratio between canvas space and world space.
  scale: number
  minScale: number
  maxScale: number

  constructor(cont: HTMLElement, canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.cont = cont

    this.pos = { x: 0, y: 0 }
    this.posDragStart = { x: 0, y: 0 }
    this.posDragLast = { x: 0, y: 0 }
    this.mousePos = { x: 0, y: 0 }

    this.clickTimeout = 100

    this.dragTimestamp = 0
    this.touchDistance = 0

    this.scale = 16
    this.minScale = 1
    this.maxScale = 400

    this.createListeners()
  }

  // return the canvas window in world space.
  screen() {
    const [x1, y1] = this.canvasToWorld(0, 0)
    const [x2, y2] = this.canvasToWorld(this.canvas.width, this.canvas.height)
    return { x1, y1, x2, y2 }
  }

  private createListeners() {
    this.cont.addEventListener('touchstart', this.ontouchstart.bind(this))
    this.cont.addEventListener('touchmove', this.ontouchmove.bind(this))
    this.cont.addEventListener('mousedown', this.onmousedown.bind(this))
    this.cont.addEventListener('mousemove', this.onmousemove.bind(this))
    this.cont.addEventListener('mouseup', this.onmouseup.bind(this))
    this.cont.addEventListener('wheel', this.onwheel.bind(this))
    // window.addEventListener('resize', this.onresize.bind(this))
    this.cont.addEventListener('keydown', this.onkeydown.bind(this))
  }

  pixelToCanvas(x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect()
    return [
      ((x - rect.left) / this.canvas.clientWidth) * this.canvas.width,
      ((y - rect.top) / this.canvas.clientHeight) * this.canvas.height,
    ]
  }

  canvasToPixel(x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect()
    return [
      ((x - rect.left) / this.canvas.width) * this.canvas.clientWidth,
      ((y - rect.top) / this.canvas.height) * this.canvas.clientHeight,
    ]
  }

  canvasToWorld(x: number, y: number) {
    return [this.pos.x + x / this.scale, this.pos.y + y / this.scale]
  }

  worldToCanvas(x: number, y: number) {
    return [(x - this.pos.x) * this.scale, (y - this.pos.y) * this.scale]
  }

  pixelToWorld(x: number, y: number) {
    const [x2, y2] = this.pixelToCanvas(x, y)
    return this.canvasToWorld(x2, y2)
  }

  worldToPixel(x: number, y: number) {
    const [x2, y2] = this.worldToCanvas(x, y)
    return this.canvasToPixel(x2, y2)
  }

  // ------------ desktop events --------------------------------
  private onmousedown(e: MouseEvent) {
    const [canvasX, canvasY] = this.pixelToCanvas(e.clientX, e.clientY)

    this.onDragStart(canvasX, canvasY)
  }

  private onmousemove(e: MouseEvent) {
    const [canvasX, canvasY] = this.pixelToCanvas(e.clientX, e.clientY)
    const [worldX, worldY] = this.canvasToWorld(canvasX, canvasY)
    this.mousePos.x = worldX
    this.mousePos.y = worldY

    if (e.buttons === 4 || (e.ctrlKey && e.buttons === 1))
      // wheel button or ctrl + left click
      this.onDrag(canvasX, canvasY)
  }

  private onmouseup(_e: MouseEvent) {}

  private onwheel(e: WheelEvent) {
    const direction = e.deltaY < 0 ? 1 : -1
    this.onZoom(0.1 * direction, e.clientX, e.clientY)
  }

  private onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') this.pos.x -= 1
    else if (e.key === 'ArrowRight') this.pos.x += 1
    else if (e.key === 'ArrowUp') this.pos.y -= 1
    else if (e.key === 'ArrowDown') this.pos.y += 1
  }

  // ------------ mobile events --------------------------------
  private ontouchstart(e: TouchEvent) {
    if (e.touches.length === 1) {
      const [canvasX, canvasY] = this.pixelToCanvas(e.touches[0].clientX, e.touches[0].clientY)
      this.onDragStart(canvasX, canvasY)
    } else if (e.touches.length === 2) {
      const distX = e.touches[0].clientX - e.touches[1].clientX
      const distY = e.touches[0].clientY - e.touches[1].clientY
      this.touchDistance = Math.sqrt(distX * distX + distY * distY)
    }
  }

  private ontouchmove(e: TouchEvent) {
    e.preventDefault()
    if (e.touches.length === 1) {
      const [canvasX, canvasY] = this.pixelToCanvas(e.touches[0].clientX, e.touches[0].clientY)
      this.onDrag(canvasX, canvasY)
    } else if (e.touches.length === 2) {
      const posX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const posY = (e.touches[0].clientY + e.touches[1].clientY) / 2
      const distX = e.touches[0].clientX - e.touches[1].clientX
      const distY = e.touches[0].clientY - e.touches[1].clientY
      const distance = Math.sqrt(distX * distX + distY * distY)
      const delta = distance / this.touchDistance - 1
      if (delta === 0) return
      this.onZoom(delta, posX, posY)
      this.touchDistance = distance
    }
  }

  // ------------------------------------------------------------
  private onZoom(factor: number, clientX: number, clientY: number) {
    let delta = factor * this.scale

    if (this.scale + delta > this.maxScale) delta = this.maxScale - this.scale
    if (this.scale + delta < this.minScale) delta = this.minScale - this.scale

    const [canvasX, canvasY] = this.pixelToCanvas(clientX, clientY)

    const zoom = (this.scale + delta) / this.scale

    this.onMove(
      canvasX / this.scale - canvasX / (this.scale * zoom),
      canvasY / this.scale - canvasY / (this.scale * zoom)
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
    if (Date.now() - this.dragTimestamp < this.clickTimeout) return

    const deltaX = x - this.posDragLast.x
    const deltaY = y - this.posDragLast.y

    this.posDragLast.x = x
    this.posDragLast.y = y

    this.onMove(-deltaX / this.scale, -deltaY / this.scale)
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
