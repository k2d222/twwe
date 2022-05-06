function TwDataFile(mapName, fileData) {
	this.mapName = mapName;
	this.fileData = fileData;
	
	this.data = new DataView(this.fileData)
	this.data.resetReader();
}

TwDataFile.prototype.parse = function() {
	console.log("begin parsing");

	// parse header
	var data = this.data;
	var signature = data.uint32()

	// signature 'DATA' or 'ATAD'
	if (signature == 0x41544144 || signature == 0x44415441)
		console.log("valid signature")
	else
		return false;

	this.version = data.uint32();

	// calculate checksum
	this.crc = Zlib.CRC32.calc(new Uint8Array(this.fileData), 0, this.fileData.byteLength)
	console.log("crc", this.crc.toString(16))

	// we only support datafile version 4
	if (this.version != 4)
	{
		console.log("invalid version", this.version)
		return false;
	}

	this.size = data.uint32();
	this.swapLen = data.uint32();
	this.numItemTypes = data.uint32();
	this.numItems = data.uint32();
	this.numRawData = data.uint32();
	this.itemSize = data.uint32();
	this.dataSize = data.uint32();

	var itemTypesStart = data.readerOffs;
	var itemOffsetsStart = itemTypesStart+this.numItemTypes*12;
	var dataOffsetsStart = itemOffsetsStart+this.numItems*4;
	var dataSizesStart = dataOffsetsStart+this.numRawData*4;
	
	this.itemStart = dataSizesStart+this.numRawData*4;
	this.dataStart = this.itemStart+this.itemSize

	// read item types
	this.itemTypes = []
	for (var i = 0; i < this.numItemTypes; i++) {
		this.itemTypes.push({
			type: data.uint32(),
			start: data.uint32(),
			num: data.uint32()
		})
	}

	// read item offsets
	this.itemOffsets = []
	for (var i = 0; i < this.numItems; i++) {
		this.itemOffsets.push(data.uint32());
	}

	// read data infos
	// offsets
	this.dataInfos = []
	for (var i = 0; i < this.numRawData; i++) {
		this.dataInfos.push({ offset: data.uint32() });	
	}
	// data sizes
	for (var i = 0; i < this.numRawData; i++) {
		// uncompressed size
		this.dataInfos[i].size = data.uint32()
		// compressed size
		if (i == this.numRawData-1) {
			this.dataInfos[i].compSize = this.dataSize-this.dataInfos[i].offset;
		} else {
			this.dataInfos[i].compSize = this.dataInfos[i+1].offset-this.dataInfos[i].offset;
		}
	}

	// decompress data
	this.decData = []
	for (var i = 0; i < this.numRawData; i++) {
		var startOffs = this.dataInfos[i].offset + this.dataStart;
		var endOffs = startOffs + this.dataInfos[i].compSize;
		cData = new Uint8Array(this.fileData.slice(startOffs, endOffs));

		// let's see what zlib.js can do :>
		var inflate = new Zlib.Inflate(cData);
		var plain = inflate.decompress();
		var arrayBuf = plain.buffer.slice(0, plain.length);
		this.decData.push(arrayBuf);
	}

	return true;
}

TwDataFile.prototype.getData = function(index) {
	return this.decData[index]
}

TwDataFile.prototype.getItemSize = function(index) {
	if (index == this.numItems-1)
		return this.itemSize - this.itemOffsets[index];
	return this.itemOffsets[index+1] - this.itemOffsets[index];
}

TwDataFile.prototype.getItem = function(index) {
	var offset = this.itemStart + this.itemOffsets[index];
	var typeAndId = this.data.getUint32(offset, true);

	var item = {
		type: (typeAndId>>16)&0xffff,
		id: typeAndId&0xffff,
		size: this.data.getUint32(offset+4, true),
		data: this.fileData.slice(offset+8, offset+8+this.getItemSize(index))
	};

	return item;
}

TwDataFile.prototype.getType = function(type) {
	for (var i = 0; i < this.numItemTypes; i++) {
		if (this.itemTypes[i].type == type) {
			return this.itemTypes[i];
		}
	}
}

TwDataFile.prototype.findItem = function(type, id) {
	var t = this.getType(type);

	for (var i = 0; i < t.num; i++) {
		var item = this.getItem(t.start);
		if (item.id == id)
			return item;
	}
}
