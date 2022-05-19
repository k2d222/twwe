import { RenderMap } from '../gl/renderMap'
import { RenderGroup } from '../gl/renderGroup'
import { RenderLayer } from '../gl/renderLayer'
import { RenderTileLayer } from '../gl/renderTileLayer'
import { RenderQuadLayer } from '../gl/renderQuadLayer'

export class TreeView {
  cont: HTMLElement
  onselect: (groupID: number, layerID: number) => any

  private groupID: number
  private layerID: number

  constructor(cont: HTMLElement, map: RenderMap) {
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
  
  private groupTree(group: RenderGroup, g: number) {
    let cont = document.createElement('div')
    cont.classList.add('group')
    
    let title = document.createElement('div')
    title.innerHTML = `<b>#${g} ${group.group.name}</b>`
    cont.append(title)

    let fold = document.createElement('input')
    fold.type = 'checkbox'
    fold.checked = true
    fold.onchange = () => cont.classList.toggle('folded')
    title.prepend(fold)

    let display = document.createElement('input')
    display.type = 'checkbox'
    display.checked = true
    display.onchange = () => group.visible = display.checked
    title.prepend(display)

    let layers = group.layers.map((l, i) => this.layerTree(l, g, i))
    cont.append(...layers)
    return cont
  }
  
  private layerTree(layer: RenderLayer, g: number, l: number) {
    let label = document.createElement('label')
    label.classList.add('layer')
    label.innerText = layer.layer.name || '<empty name>'

    if (layer instanceof RenderTileLayer) {
      let input = document.createElement('input')
      input.name = 'layer'
      input.type = 'radio'
      input.value = layer.layer.name || '<empty name>'
      input.dataset.groupID = '' + g
      input.dataset.layerID = '' + l

      input.onchange = () => {
        this.groupID = g
        this.layerID = l
        this.onselect(g, l)
      }

      label.prepend(input)
    }

    let check = document.createElement('input')
    check.type = 'checkbox'
    check.checked = true
    check.onchange = () => layer.visible = check.checked
    label.prepend(check)

    return label
  }
}
