import { Map } from '../twmap/map'
import { Group } from '../twmap/group'
import { Layer } from '../twmap/layer'

export class TreeView {
  cont: HTMLElement
  onselect: (groupID: number, layerID: number) => any

  private groupID: number
  private layerID: number

  constructor(cont: HTMLElement, map: Map) {
    this.cont = cont
    this.onselect = () => {}
    this.groupID = -1
    this.layerID = -1
    cont.innerHTML = ''
    
    let groups = map.groups.map((g, i) => this.groupTree(g, i))
    cont.append(...groups)
  }
  
  getSelected() {
    return [ this.groupID, this.layerID ]
  }
  
  select(groupID: number, layerID: number) {
    let radios: NodeListOf<HTMLInputElement> = this.cont.querySelectorAll('input[type=radio]')
    for(let r of radios) {
      let thisLayerID = parseInt(r.dataset.layerID)
      let thisGroupID = parseInt(r.dataset.groupID)
      if (thisLayerID === layerID && thisGroupID === groupID) {
        r.checked = true
        this.groupID = groupID
        this.layerID = layerID
        this.onselect (groupID, layerID)
        return
      }
    }
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

    input.onchange = () => {
      this.groupID = g
      this.layerID = l
      this.onselect(g, l)
    }

    let label = document.createElement('label')
    label.classList.add('layer')
    label.innerText = layer.name || '<empty name>'
    label.prepend(input)

    return label
  }
}
