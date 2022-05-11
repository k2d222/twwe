import { Color, LayerTile, LayerType, MapLayerTiles } from './types'
import { Layer } from './layer'
import { parseLayerTiles } from './parser'
import { DataFile } from './datafile'

export class TileLayer extends Layer {
	name: string
	width: number
	height: number
	tiles: LayerTile[]
	color: Color
		
	constructor() {
		super(LayerType.TILES)
		this.name = "unnamed layer"
		this.width = 0
		this.height = 0
		this.tiles = []
		this.color = { r: 0, g: 0, b: 0, a: 0 }
	}
	
	load(df: DataFile, info: MapLayerTiles) {
		this.name = info.name
		this.width = info.width
		this.height = info.height
		this.color = info.color

		let tileData = df.getData(info.data)
		this.tiles = parseLayerTiles(tileData, info.width * info.height)
	}
}

