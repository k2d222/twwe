export class DataReader extends DataView {
  private off: number

  constructor(data: ArrayBuffer) {
    super(data)
    this.off = 0
  }

  offset() {
    return this.off
  }

  reset() {
    this.off = 0
  }

  uint8() {
    this.off += 1
    return this.getUint8(this.off - 1)
  }

  uint32() {
    this.off += 4
    return this.getUint32(this.off - 4, true) // little endian
  }

  int16() {
    this.off += 2
    return this.getInt16(this.off - 2, true) // little endian
  }

  int32() {
    this.off += 4
    return this.getInt32(this.off - 4, true) // little endian
  }

  // see: https://github.com/heinrich5991/libtw2/blob/master/doc/map.md
  int32Str(len: number) {
    const slices: Uint8Array[] = []
    for (let i = 0; i < len; i++) {
      const start = this.off + 4 * i
      const end = this.off + 4 * (i + 1)
      const arr = new Uint8Array(this.buffer.slice(start, end)).map(x => x - 128)
      slices.push(arr)
    }

    this.off += len * 4

    let buf = slices
      .map(s => s.reverse())
      .map(s => [...s])
      .flat()

    let nullterm = buf.findIndex(x => x === 0)
    if (nullterm === -1) nullterm = buf.length - 1
    buf = buf.slice(0, nullterm)

    return String.fromCharCode.apply(null, buf)
  }

  bytesLeft() {
    return this.byteLength - this.off
  }
}
