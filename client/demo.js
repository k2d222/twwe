var fs = require("fs");

chunkTypeNames = [];

chunkTypeNames[0] = "invalid";
chunkTypeNames[1] = "snapshot";
chunkTypeNames[2] = "message";
chunkTypeNames[3] = "snapshot_delta";

function Demo(filePath)
{
	this.path = filePath;
	var reader = fs.createReadStream(filePath, {start: 0, end: 176-1});

	var self = this;

	reader.on('data', function(chunk) { self.parseHeader(chunk); });

	reader.on('error', function(e) {
		console.log(e);	
	});
}

Buffer.prototype.readerInit = function() {
	this._readerOffs = 0;
}

Buffer.prototype.readRaw = function(size) {
	var data = this.slice(this._readerOffs, this._readerOffs+size);
	this._readerOffs += size;
	return data;
}

Buffer.prototype.readCString = function(size) {
	var data = this.readRaw(size);

	// null termination
	for (var i = 0; i < data.length; i++)
	{
		if (data[i] == 0)
		{
			data = data.slice(0, i);
			break;
		}
	}

	return data.toString();
}

Buffer.prototype.uint32 = function() {
	return this.readRaw(4).readUInt32BE(0);
}

Demo.prototype.parseHeader = function(data) {
	if (data.length != 176)
	{
		this.error = "read invalid size "+data.length;
		return;
	}

	data.readerInit();

	this.header = {};
	var h = this.header;

	// magic
	h.magic = data.readCString(7);

	// version
	h.version = data.readRaw(1)[0];

	// netversion
	h.netVersion = data.readCString(64);

	// mapname
	h.mapName = data.readCString(64);

	// mapsize
	h.mapSize = data.uint32();

	// length
	h.mapCrc = data.uint32();

	// type
	h.type = data.readCString(8);

	// length
	h.length = data.uint32(4);

	// timestamp
	h.timeStamp = data.readCString(20);



	console.log(h);
	this.test();
}

Demo.prototype.test = function() {
	// find offset of first chunk
	this.firstChunk = /*header*/ 176 + 
						/*timeline markers*/ 4 + 4*64 +
						/*mapdata*/ this.header.mapSize;
	
	console.log("first chunk", this.firstChunk);
	var data = fs.readFileSync(this.path);

	data = data.slice(this.firstChunk);
	data.readerInit();
	
	var offs = 0;


	while (offs < data.length)
	{
		var lastOffs = offs;
		var chunk = data[offs];
		offs++;

		// CHUNKTYPEFLAG_TICKMARKER
		if ((chunk&0x80))
		{
			//console.log("tickmarker");
			// CHUNKMASK_TICK
			if ((chunk&0x3f) == 0)
			{
				// tickdata
				offs += 4; // skip tick data
			}
			/*else
			{
			
			}*/
		}
		else
		{
			// normal chunk
			// CHUNKMASK_TYPE
			var type = (chunk&0x60)>>5;
			// CHUNKMASK_SIZE
			var size = (chunk&0x1f);

			// check for extended size
			if (size == 30)
			{
				// char
				size = data[offs++];
			}
			else if (size == 31)
			{
				// short
				size = data.readUInt16LE(offs);
				offs += 2;
			}

				console.log((lastOffs+this.firstChunk).toString(16), "type", chunkTypeNames[type], "size", size);

			offs += size;
		}
	}
}

//var d = new Demo("./nice_scene.demo");
var d = new Demo("./autorecord_2014-08-06_17-35-06.demo");
