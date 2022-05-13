import { crc32 } from 'crc'
import { inflate } from 'pako' // zlib

import { DataReader } from './dataReader'

type ItemType = {
	type: number,
	start: number, 
	num: number,
}

type DataInfo = {
	offset: number,
	size: number,
	compSize: number,
}

export class DataFile {
	mapName: string
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

	constructor(mapName: string, data: ArrayBuffer) {
		this.mapName = mapName
		this.data = data
	
		this.reader = new DataReader(this.data)
		this.reader.reset()
		
		this.parse()
	}
	
	private parse() {
		console.log("begin parsing")

		// parse header
		const { reader } = this
		var signature = reader.uint32()

		// signature 'DATA' or 'ATAD'
		if (signature == 0x41544144 || signature == 0x44415441)
			console.log("valid signature")
		else
			return false

		this.version = reader.uint32()

		// calculate checksum
		this.crc = crc32(new Uint8Array(this.data))
		console.log("crc", this.crc.toString(16))

		// we only support datafile version 4
		if (this.version != 4) {
			console.log("invalid version", this.version)
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
		const itemOffsetsStart = itemTypesStart+this.numItemTypes*12
		const dataOffsetsStart = itemOffsetsStart+this.numItems*4
		const dataSizesStart = dataOffsetsStart+this.numRawData*4
	
		this.itemStart = dataSizesStart+this.numRawData*4
		this.dataStart = this.itemStart+this.itemSize

		// read item types
		this.itemTypes = []
		for (let i = 0; i < this.numItemTypes; i++) {
			this.itemTypes.push({
				type: reader.uint32(),
				start: reader.uint32(),
				num: reader.uint32()
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
			if (i == this.numRawData-1) {
				this.dataInfos[i].compSize = this.dataSize-this.dataInfos[i].offset
			} else {
				this.dataInfos[i].compSize = this.dataInfos[i+1].offset-this.dataInfos[i].offset
			}
		}

		// decompress data
		this.decData = []
		for (let i = 0; i < this.numRawData; i++) {
			let startOff = this.dataInfos[i].offset + this.dataStart
			let endOff = startOff + this.dataInfos[i].compSize
			let cData = new Uint8Array(this.data.slice(startOff, endOff))
			let infl = inflate(cData)
			let arrayBuf = infl.buffer.slice(0, infl.length)
			this.decData.push(arrayBuf)
		}

		return true
	}
	
	getData(index: number) {
		return this.decData[index]
	}
	
	getItemSize(index: number) {
		if (index === this.numItems-1)
			return this.itemSize - this.itemOffsets[index]
		return this.itemOffsets[index+1] - this.itemOffsets[index]
	}
	
	getItem(index: number) {
		let offset = this.itemStart + this.itemOffsets[index]
		let typeAndId = this.reader.getUint32(offset, true)

		let item = {
			type: (typeAndId >> 16) & 0xffff,
			id: typeAndId & 0xffff,
			size: this.reader.getUint32(offset+4, true),
			data: this.data.slice(offset+8, offset+8+this.getItemSize(index))
		}

		return item
	}
	
	getType(type: number) {
		for (let i = 0; i < this.numItemTypes; i++) {
			if (this.itemTypes[i].type == type) {
				return this.itemTypes[i]
			}
		}
	}
	
	findItem(type: number, id: number) {
		var t = this.getType(type)

		for (let i = 0; i < t.num; i++) {
			let item = this.getItem(t.start)
			if (item.id === id)
				return item
		}
	}
}
