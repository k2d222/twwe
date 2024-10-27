import { crc32 } from 'crc'
import { inflate } from 'pako' // zlib

import { type UUID, compare as compareUUID } from './uuid'
import { DataReader } from './dataReader'

type ItemType = {
  type: number
  start: number
  num: number
}

type DataInfo = {
  offset: number
  size: number
  compSize: number
}

type Item = {
  type: number
  id: number
  size: number
  data: ArrayBuffer
}

export class DataFile {
  data: ArrayBuffer
  reader: DataReader
  version: number
  crc: number

  // header info
  size: number
  swapLen: number
  numItemTypes: number
  numItems: number
  numRawData: number
  itemSize: number
  dataSize: number

  itemStart: number
  dataStart: number

  itemTypes: ItemType[]
  itemOffsets: number[]

  dataInfos: DataInfo[]

  decData: ArrayBuffer[]

  constructor(data: ArrayBuffer) {
    this.data = data
    this.version = 0
    this.crc = 0

    this.size = 0
    this.swapLen = 0
    this.numItemTypes = 0
    this.numItems = 0
    this.numRawData = 0
    this.itemSize = 0
    this.dataSize = 0

    this.itemStart = 0
    this.dataStart = 0

    this.itemTypes = []
    this.itemOffsets = []

    this.dataInfos = []

    this.decData = []

    this.reader = new DataReader(this.data)
    this.reader.reset()

    this.parse()
  }

  private parse() {
    // parse header
    const { reader } = this
    var signature = reader.uint32()

    // signature 'DATA' or 'ATAD'
    if (signature !== 0x41544144 && signature !== 0x44415441) {
      console.error('invalid map signature')
      return false
    }

    this.version = reader.uint32()

    // calculate checksum
    this.crc = crc32(new Uint8Array(this.data))

    // we only support datafile version 4
    if (this.version != 4) {
      console.error('invalid map version', this.version)
      return false
    }

    this.size = reader.uint32()
    this.swapLen = reader.uint32()
    this.numItemTypes = reader.uint32()
    this.numItems = reader.uint32()
    this.numRawData = reader.uint32()
    this.itemSize = reader.uint32()
    this.dataSize = reader.uint32()

    const itemTypesStart = reader.offset()
    const itemOffsetsStart = itemTypesStart + this.numItemTypes * 12
    const dataOffsetsStart = itemOffsetsStart + this.numItems * 4
    const dataSizesStart = dataOffsetsStart + this.numRawData * 4

    this.itemStart = dataSizesStart + this.numRawData * 4
    this.dataStart = this.itemStart + this.itemSize

    // read item types
    this.itemTypes = []
    for (let i = 0; i < this.numItemTypes; i++) {
      this.itemTypes.push({
        type: reader.uint32(),
        start: reader.uint32(),
        num: reader.uint32(),
      })
    }

    // read item offsets
    this.itemOffsets = []
    for (let i = 0; i < this.numItems; i++) {
      this.itemOffsets.push(reader.uint32())
    }

    // read data infos
    // offsets
    this.dataInfos = []
    for (let i = 0; i < this.numRawData; i++) {
      this.dataInfos.push({
        offset: reader.uint32(),
        size: -1,
        compSize: -1,
      })
    }

    // data sizes
    for (let i = 0; i < this.numRawData; i++) {
      // uncompressed size
      this.dataInfos[i].size = reader.uint32()
      // compressed size
      if (i == this.numRawData - 1) {
        this.dataInfos[i].compSize = this.dataSize - this.dataInfos[i].offset
      } else {
        this.dataInfos[i].compSize = this.dataInfos[i + 1].offset - this.dataInfos[i].offset
      }
    }

    // decompress data
    this.decData = []
    for (let i = 0; i < this.numRawData; i++) {
      const startOff = this.dataInfos[i].offset + this.dataStart
      const endOff = startOff + this.dataInfos[i].compSize
      const cData = new Uint8Array(this.data.slice(startOff, endOff))
      const infl = inflate(cData)
      const arrayBuf = infl.buffer.slice(0, infl.length)
      this.decData.push(arrayBuf)
    }

    return true
  }

  getData(index: number) {
    return this.decData[index]
  }

  getItemSize(index: number) {
    if (index === this.numItems - 1) return this.itemSize - this.itemOffsets[index]
    return this.itemOffsets[index + 1] - this.itemOffsets[index]
  }

  getItem(index: number): Item {
    const offset = this.itemStart + this.itemOffsets[index]
    const typeAndId = this.reader.getUint32(offset, true)

    const item = {
      type: (typeAndId >> 16) & 0xffff,
      id: typeAndId & 0xffff,
      size: this.reader.getUint32(offset + 4, true),
      data: this.data.slice(offset + 8, offset + 8 + this.getItemSize(index)),
    }

    return item
  }

  getType(type: number): ItemType | null {
    for (let i = 0; i < this.numItemTypes; i++) {
      if (this.itemTypes[i].type == type) {
        return this.itemTypes[i]
      }
    }

    return null
  }

  findUuidType(uuid: UUID): ItemType | null {
    const uuidIndex = this.getType(0xffff)
    if (uuidIndex === null) return null

    for (let i = 0; i < uuidIndex.num; i++) {
      const item = this.getItem(uuidIndex.start + i)

      // COMBAK: this looks very ineffective, just because little endian
      const view = new DataView(item.data.slice(0, 16))
      view.setUint32(0, view.getUint32(0, true)) // swap endianess
      view.setUint32(4, view.getUint32(4, true))
      view.setUint32(8, view.getUint32(8, true))
      view.setUint32(12, view.getUint32(12, true))
      const thisUuid = new Uint8Array(view.buffer)

      if (compareUUID(uuid, thisUuid)) return this.getType(item.id)
    }

    return null
  }

  findItem(type: number, id: number): Item | null {
    const t = this.getType(type)
    if (t === null) return null

    for (let i = 0; i < t.num; i++) {
      const item = this.getItem(t.start + i)
      if (item.id === id) return item
    }

    return null
  }
}
