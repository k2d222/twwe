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
    
    const groups = map.groups.map((g, i) => this.groupTree(g, i))
    cont.append(...groups)
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
        this.onselect (groupID, layerID)
        return
      }
    }
  }
  
  private groupTree(group: RenderGroup, g: number) {
    const cont = document.createElement('div')
    cont.classList.add('group', 'visible')
    
    const title = document.createElement('div')
    title.classList.add('title')
    title.innerHTML = `<b>#${g} ${group.group.name}</b>`
    cont.append(title)

    const fold = document.createElement('span')
    fold.classList.add('fold')
    fold.onclick = () => cont.classList.toggle('folded')
    title.prepend(fold)
    
    const eye = document.createElement('span')
    eye.classList.add('eye')
    eye.onclick = () => {
      group.visible = !group.visible
      cont.classList.toggle('visible')
    }
    title.append(eye)

    const layers = group.layers.map((l, i) => this.layerTree(l, g, i))
    cont.append(...layers)
    return cont
  }
  
  private layerTree(layer: RenderLayer, g: number, l: number) {
    const cont = document.createElement('div')
    cont.classList.add('layer', 'visible')
    
    const label = document.createElement('label')
    label.innerText = layer.layer.name || '<empty name>'
    cont.append(label)

    if (layer instanceof RenderTileLayer) {
      const input = document.createElement('input')
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

    const eye = document.createElement('span')
    eye.classList.add('eye')
    eye.onclick = () => {
      layer.visible = !layer.visible
      cont.classList.toggle('visible')
    }
    cont.append(eye)

    return cont
  }
}
