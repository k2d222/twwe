import { Map } from '../twmap/map'
import { Group } from '../twmap/group'
import { Layer } from '../twmap/layer'

export class TreeView {
  constructor(cont: HTMLElement, map: Map) {
    cont.innerHTML = ''
    
    let groups = map.groups.map(g => this.groupTree(g))
    cont.append(...groups)
  }
  
  private groupTree(group: Group) {
    let cont = document.createElement('div')
    cont.classList.add('group')
    cont.innerText = group.name
    let layers = group.layers.map(l => this.layerTree(l))
    cont.append(...layers)
    return cont
  }
  
  private layerTree(layer: Layer) {
    let cont = document.createElement('div')
    cont.classList.add('layer')
    cont.innerText = layer.name
    return cont
  }
}
