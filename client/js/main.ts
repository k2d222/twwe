import { Server } from './server/server'
import { ChangeData, MapInfo } from './server/protocol'
import { Map } from './twmap/map'
import { LayerType } from './twmap/types'
import { RenderMap } from './gl/renderMap'
import { init as glInit, renderer, viewport } from './gl/global'
import { TreeView } from './ui/treeView'
import { TileSelector } from './ui/tileSelector'
import { Lobby } from './ui/lobby'

// all html elements are prefixed with $, but no JQuery :)
const $canvas: HTMLCanvasElement = document.querySelector('canvas')
const $nav: HTMLElement = document.querySelector('nav')
const $tree: HTMLElement = $nav.querySelector('#tree')
const $selector: HTMLElement = document.querySelector('#tile-selector')
const $mapName: HTMLElement = document.querySelector('#map-name')
const $dialog: HTMLElement = document.querySelector('#dialog')
const $dialogContent: HTMLElement = $dialog.querySelector('.content')
const $users: HTMLElement = document.querySelector('#users span')
const $btnSave: HTMLElement = document.querySelector('#save')
const $btnDownload: HTMLElement = document.querySelector('#download')
const $btnToggleNav: HTMLElement = document.querySelector('#nav-toggle')
const $lobby: HTMLElement = document.querySelector('#lobby')

let map: Map
let rmap: RenderMap
let server: Server

// UI components
let treeView: TreeView
let tileSelector = new TileSelector($selector)
let lobby = new Lobby($lobby)


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

  $btnSave.addEventListener('click', () => {
    server.send('save')
  })

  $btnDownload.addEventListener('click', async () => {
    const buf = await server.query('map')
    const blob = new Blob([buf], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a');
    link.href = url;
    link.download = map.name + '.map';

    document.body.append(link);
    link.click();
    link.remove();
  })
}

async function main() {

  showDialog('Connecting to server…')
  await setupServer()
  try {
    let mapInfos = await server.query('maps')
    hideDialog()
    let mapName = await lobby.chooseMap(mapInfos)
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
