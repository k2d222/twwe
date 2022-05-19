import { Server } from './server/server'
import { ChangeData, MapInfo } from './server/protocol'
import { Map } from './twmap/map'
import { RenderMap } from './gl/renderMap'
import { init as glInit, renderer, viewport } from './gl/global'
import { TreeView } from './ui/treeView'
import { TileSelector } from './ui/tileSelector'
import { LayerType } from './twmap/types'

// all html elements are prefixed with $, but no JQuery :)
const $canvas: HTMLCanvasElement = document.querySelector('canvas')
const $nav: HTMLElement = document.querySelector('nav')
const $tree: HTMLElement = $nav.querySelector('#tree')
const $selector: HTMLElement = document.querySelector('#tile-selector')
const $mapName: HTMLElement = $nav.querySelector('#map-name')
const $dialog: HTMLElement = document.querySelector('#dialog')
const $dialogContent: HTMLElement = $dialog.querySelector('.content')
const $users: HTMLElement = document.querySelector('#users span')
const $btnSave: HTMLElement = document.querySelector('#save')
const $btnToggleNav: HTMLElement = document.querySelector('#nav-toggle')
const $lobby: HTMLElement = document.querySelector('#lobby')
const $btnJoin: HTMLElement = $lobby.querySelector('button')
const $lobbyList: HTMLElement = $lobby.querySelector('.list')

let map: Map
let rmap: RenderMap
let server: Server

let treeView: TreeView
let tileSelector: TileSelector


function showDialog(msg: string) {
  $dialogContent.innerText = msg
  $dialog.classList.remove('hidden')
}

function hideDialog() {
  $dialogContent.innerText = ''
  $dialog.classList.add('hidden')
}

async function setupServer() {
  // setup server
  server = await Server.create(process.env.BACKEND_HOST, parseInt(process.env.BACKEND_PORT, 10))
  .catch((e) => {
    showDialog(`Failed to connect to the server ${process.env.BACKEND_HOST}:${process.env.BACKEND_PORT}.`)
    throw e
  })

  server.on('change', (e) => {
    rmap.applyChange(e)
  })

  server.on('users', (e) => {
    $users.innerText = e.count + ''
  })

  $btnSave.addEventListener('click', () => {
    server.send('save')
  })
}

function setupGL() {

  glInit($canvas)
  rmap = new RenderMap(map)

  function loop() {
    renderer.render(rmap)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

function placeTile() {
    let { x, y } = viewport.mousePos
    x = Math.floor(x)
    y = Math.floor(y)

    let [ group, layer ] = treeView.getSelected()
    let id = tileSelector.getSelected()

    let change: ChangeData = {
      group,
      layer,
      x,
      y,
      id,
    }

    const res = rmap.applyChange(change)

    // only apply change if succeeded e.g. not redundant
    if(res) {
      console.log('change:', change)
      server.send('change', change)
    }
}

function setupUI() {
  treeView = new TreeView($tree, rmap)
  tileSelector = new TileSelector($selector)

  const [ groupID, layerID ] = map.gameLayerID()

  treeView.onselect = (groupID, layerID) => {
    const layer = map.groups[groupID].layers[layerID]
    let image = layer.image
    if (layer.type === LayerType.GAME)
      image = rmap.gameLayer.texture.image
    tileSelector.setImage(image)
  }

  treeView.select(groupID, layerID)

  $mapName.innerText = map.name

  viewport.onclick = () => placeTile()

  window.addEventListener('keydown', (e) => {
    e.preventDefault()
    if (e.key === ' ')
      placeTile()
    else if (e.key === 'Tab')
      $nav.classList.toggle('hidden')
  })

  $btnToggleNav.addEventListener('click', () => {
    $nav.classList.toggle('hidden')
  })
}

function chooseMap(mapInfos: MapInfo[]): Promise<string> {
  // sort by [users desc, name asc]
  mapInfos = mapInfos.sort((a, b) => {
    if (a.users === b.users) {
      return a.name.localeCompare(b.name)
    }
    else {
      return b.users - a.users
    }
  })

  return new Promise(resolve => {
    $lobbyList.innerHTML = ''

    const t1 = document.createElement('span')
    const t2 = document.createElement('span')
    const t3 = document.createElement('span')
    t2.innerText = 'Maps'
    t3.innerText = 'Online'
    $lobbyList.append(t1, t2, t3)

    let i = 0
    let selected = ''

    for (const info of mapInfos) {
      const $btn = document.createElement('input')
      $btn.type = 'radio'
      $btn.name = 'map'
      $btn.onchange = () => selected = info.name

      const $name = document.createElement('span')
      $name.classList.add('name')
      $name.innerText = info.name

      const $users = document.createElement('span')
      $users.classList.add('users')
      $users.innerText = '' + info.users

      $lobbyList.append($btn, $name, $users)
      i++
    }

    // check the first one
    $lobby.querySelector('input').checked = true
    selected = mapInfos[0].name

    $btnJoin.onclick = () => {
      $lobby.classList.add('hidden')
      resolve(selected)
    }
    $lobby.classList.remove('hidden')
  })
}

async function main() {

  showDialog('Connecting to server…')
  await setupServer()
  try {
    let mapInfos = await server.query('maps')
    hideDialog()
    let mapName = await chooseMap(mapInfos)
    showDialog('Joining room…')
    let joined = await server.query('join', mapName)
    if (!joined) throw 'failed to join the room'
    let buf = await server.query('map')
    map = new Map(mapName, buf)
  }
  catch (e) {
    console.error(e)
    showDialog('Error: ' + e)
    return
  }

  setupGL()
  setupUI()
  hideDialog()
  console.log('up and running!')
}


main()
