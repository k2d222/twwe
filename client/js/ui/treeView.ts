import { Map } from '../twmap/map'
import { Group } from '../twmap/group'
import { Layer } from '../twmap/layer'

export class TreeView {
  cont: HTMLElement

  constructor(cont: HTMLElement, map: Map) {
    this.cont = cont
    cont.innerHTML = ''
    
    let groups = map.groups.map((g, i) => this.groupTree(g, i))
    cont.append(...groups)
  }
  
  // returns [ groupID, layerID ]
  getSelected() {
    let radios: NodeListOf<HTMLInputElement> = this.cont.querySelectorAll('input[type=radio]')
    for(let r of radios) {
      if (r.checked) {
        let layerID  = parseInt(r.dataset.layerID)
        let groupID  = parseInt(r.dataset.groupID)
        return [ groupID, layerID ]
      }
    }
    return [ -1, -1 ]
  }
  
  private groupTree(group: Group, g: number) {
    let cont = document.createElement('div')
    cont.classList.add('group')
    cont.innerHTML = `<b>#${g} ${group.name}</b>`
    let layers = group.layers.map((l, i) => this.layerTree(l, g, i))
    cont.append(...layers)
    return cont
  }
  
  private layerTree(layer: Layer, g: number, l: number) {
    let input = document.createElement('input')
    input.name = 'layer'
    input.type = 'radio'
    input.value = layer.name || '<empty name>'
    input.dataset.groupID = '' + g
    input.dataset.layerID = '' + l

    let label = document.createElement('label')
    label.classList.add('layer')
    label.innerText = layer.name || '<empty name>'
    label.prepend(input)

    return label
  }
}
