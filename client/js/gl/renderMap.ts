import { Map } from '../twmap/map'
import { RenderGroup } from './renderGroup'
import { gl } from './global'

export class RenderMap {
  map: Map
  groups: RenderGroup[]
  
  constructor(map: Map) {
    this.map = map
    this.groups = map.groups.map(g => new RenderGroup(g))
  }
  
  render() {
    for(let group of this.groups)
      group.render()
    
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}
