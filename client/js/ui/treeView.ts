import { Map } from '../twmap/map'
import { Group } from '../twmap/group'
import { Layer } from '../twmap/layer'
import { TileLayer } from '../twmap/tileLayer'
import { QuadLayer } from '../twmap/quadLayer'

export class TreeView {
  cont: HTMLElement
  optionsCont: HTMLElement

  onSelectLayer: (groupID: number, layerID: number) => any
  onNewGroup: () => any
  onNewLayer: (groupID: number) => any
  onToggleGroup: (groupID: number) => any
  onToggleLayer: (groupID: number, layerID: number) => any

  private groupID: number
  private layerID: number

  constructor(cont: HTMLElement, map: Map) {
    this.cont = cont
    this.optionsCont = cont.querySelector('.contextual-menu')
    this.onSelectLayer = () => {}
    this.onNewGroup = () => {}
    this.onNewLayer = () => {}
    this.onToggleGroup = () => {}
    this.onToggleLayer = () => {}
    this.groupID = -1
    this.layerID = -1
    cont.innerHTML = ''
    
    const groups = map.groups.map((g, i) => this.groupTree(g, i))
    cont.append(...groups)
    
    const btnNewGroup = document.createElement('button')
    btnNewGroup.innerText = 'Add group'
    btnNewGroup.onclick = () => this.onNewGroup()
    cont.append(btnNewGroup)
  }
  
  getSelected() {
    return [ this.groupID, this.layerID ]
  }
  
  select(groupID: number, layerID: number) {
    const radios: NodeListOf<HTMLInputElement> = this.cont.querySelectorAll('input[type=radio]')
    for(const r of radios) {
      const thisLayerID = parseInt(r.dataset.layerID)
      const thisGroupID = parseInt(r.dataset.groupID)
      if (thisLayerID === layerID && thisGroupID === groupID) {
        r.checked = true
        this.groupID = groupID
        this.layerID = layerID
        this.onSelectLayer (groupID, layerID)
        return
      }
    }
  }
  
  private groupTree(group: Group, g: number) {
    const cont = document.createElement('div')
    cont.classList.add('group', 'visible')
    
    const title = document.createElement('div')
    title.classList.add('title')
    title.innerHTML = `<b>#${g} ${group.name}</b>`
    cont.append(title)

    const fold = document.createElement('span')
    fold.classList.add('fold')
    fold.onclick = () => cont.classList.toggle('folded')
    title.prepend(fold)
    
    const options = document.createElement('span')
    options.classList.add('options')
    options.onclick = () => {
    }
    title.append(options)

    const eye = document.createElement('span')
    eye.classList.add('eye')
    eye.onclick = () => {
      cont.classList.toggle('visible')
      this.onToggleGroup(g)
    }
    title.append(eye)

    const layers = group.layers.map((l, i) => this.layerTree(l, g, i))
    cont.append(...layers)
    return cont
  }
  
  private layerTree(layer: Layer, g: number, l: number) {
    const cont = document.createElement('div')
    cont.classList.add('layer', 'visible')
    
    const label = document.createElement('label')
    label.innerText = layer.name || '<empty name>'
    cont.append(label)

    if (layer instanceof TileLayer) {
      const input = document.createElement('input')
      input.name = 'layer'
      input.type = 'radio'
      input.value = layer.name || '<empty name>'
      input.dataset.groupID = '' + g
      input.dataset.layerID = '' + l

      input.onchange = () => {
        this.groupID = g
        this.layerID = l
        this.onSelectLayer(g, l)
      }

      label.prepend(input)
    }

    const options = document.createElement('span')
    options.classList.add('options')
    options.onclick = () => this.showLayerOptions(layer, g, l)
    cont.append(options)

    const eye = document.createElement('span')
    eye.classList.add('eye')
    eye.onclick = () => {
      this.onToggleLayer(g, l)
      cont.classList.toggle('visible')
    }
    cont.append(eye)

    return cont
  }
  
  private showLayerOptions(layer: Layer, g: number, l: number) {
    this.optionsCont.innerHTML = ''
    
    const width =
    this.options
    
  }
}
