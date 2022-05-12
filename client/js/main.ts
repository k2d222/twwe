import { Server } from './server/server'
import { Map } from './twmap/map'
import { RenderMap } from './gl/renderMap'
import { init as glInit, renderer, viewport } from './gl/global'
import { TreeView } from './ui/treeView'

const MAP_URL = '/maps/sunny.map'


// all html elements are prefixed with $, but no JQuery :)
let $canvas: HTMLCanvasElement = document.querySelector('canvas')
let $nav: HTMLElement = document.querySelector('nav')
let $tree: HTMLElement = $nav.querySelector('#tree')
let $mapName: HTMLElement = $nav.querySelector('#map-name')
let $dialog: HTMLElement = document.querySelector('#dialog')
let $dialogContent: HTMLElement = $dialog.querySelector('.content')
let $users: HTMLElement = document.querySelector('#users span')


function showDialog(msg: string) {
  $dialogContent.innerText = msg
  $dialog.classList.remove('hidden')
}

function hideDialog() {
  $dialogContent.innerText = ''
  $dialog.classList.add('hidden')
}

async function loadMapData(mapURL: string) {
  let res = await fetch(mapURL)
  return await res.arrayBuffer()
}

async function setupServer() {
  // setup server  
  let server = await Server.create('pi.thissma.fr', 16900)
  .catch((e) => {
    showDialog('Failed to connect to the server.')
    throw e
  })

  server.on('change', (e) => {
    console.log('change:', e)
  })

  server.on('users', (e) => {
    $users.innerText = e.count + ''
  })
}

function setupGL(map: Map) {

  glInit($canvas)
  let rmap = new RenderMap(map)

  function loop() {
    renderer.render(rmap)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

function setupUI(map: Map) {
  new TreeView($tree, map)
  $mapName.innerText = map.name

  $canvas.addEventListener('click', (e) => {
    let [ x, y ] = viewport.pixelToWorld(e.clientX, e.clientY)
    let tileX = Math.floor(x)
    let tileY = Math.floor(y)
    // map.groups.
    console.log(tileX, tileY)
  })
}

async function main() {
  showDialog('Connecting to server…')
  await setupServer()
  let mapData = await loadMapData(MAP_URL)
  let map = new Map("Sunny Side Up", mapData)
  setupGL(map)
  setupUI(map)
  hideDialog()
  console.log('up and running!')
}


main()