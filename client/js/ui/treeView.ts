import { Map } from '../twmap/map'
import { Group } from '../twmap/group'
import { Layer } from '../twmap/layer'

export class TreeView {
  constructor(cont: HTMLElement, map: Map) {
    cont.innerHTML = ''
    
    let groups = map.groups.map((g, i) => this.groupTree(g, i))
    cont.append(...groups)
  }
  
  private groupTree(group: Group, i: number) {
    let cont = document.createElement('div')
    cont.classList.add('group')
    cont.innerHTML = `<b>#${i} ${group.name}</b>`
    let layers = group.layers.map((l, i) => this.layerTree(l, i))
    cont.append(...layers)
    return cont
  }
  
  private layerTree(layer: Layer, i: number) {
    let input = document.createElement('input')
    input.name = 'layer'
    input.type = 'radio'
    input.value = layer.name || '<empty name>'

    let label = document.createElement('label')
    label.classList.add('layer')
    label.innerText = layer.name || '<empty name>'
    label.prepend(input)

    return label
  }
}
