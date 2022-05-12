import { Color, LayerTile, LayerType, MapLayerTiles, MapItemType } from './types'
import { Layer } from './layer'
import { parseLayerTiles, parseMapImage } from './parser'
import { DataFile } from './datafile'
import { Image } from './image'

export class TileLayer extends Layer {
	width: number
	height: number
	tiles: LayerTile[]
	color: Color
	image: Image | null
		
	constructor() {
		super(LayerType.TILES)
		this.width = 0
		this.height = 0
		this.tiles = []
		this.color = { r: 0, g: 0, b: 0, a: 0 }
		this.image = null
	}
	
	load(df: DataFile, info: MapLayerTiles) {
		this.type = info.flags // game, tiles, tele…
		this.name = info.name
		this.width = info.width
		this.height = info.height
		this.color = info.color
		
		if(info.image !== -1) {
	    let imagesInfo = df.getType(MapItemType.IMAGE)
			let imageItem = df.getItem(imagesInfo.start + info.image)
	    let imageInfo = parseMapImage(imageItem.data)
	    this.image = new Image()
	    this.image.load(df, imageInfo)
		}
		else {
			this.image = null
		}

		let tileData = df.getData(info.data)
		this.tiles = parseLayerTiles(tileData, info.width * info.height)
	}
}

