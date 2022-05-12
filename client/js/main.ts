import { Server } from './server/server'
import { Map } from './twmap/map'
import { RenderMap } from './gl/renderMap'
import { init as glInit, renderer } from './gl/global'
import { TreeView } from './ui/treeView'

const MAP_URL = '/maps/sunny.map'

function showDialog(msg: string) {
  let dialog: HTMLElement = document.querySelector('#dialog')
  let content: HTMLElement = dialog.querySelector('.content')
  content.innerText = msg
  dialog.classList.remove('hidden')
}

function hideDialog() {
  let dialog: HTMLElement = document.querySelector('#dialog')
  let content: HTMLElement = dialog.querySelector('.content')
  content.innerText = ''
  dialog.classList.add('hidden')
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
  
  })
}

function setupGL(map: Map) {

  let canvas = document.querySelector('canvas')
  glInit(canvas)
  let rmap = new RenderMap(map)

  function loop() {
    renderer.render(rmap)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

function setupNavBar(map: Map) {
  let nav: HTMLElement = document.querySelector('nav')
  let tree: HTMLElement = nav.querySelector('#tree')
  new TreeView(tree, map)
}

async function main() {
  showDialog('Connecting to server…')
  await setupServer()
  let mapData = await loadMapData(MAP_URL)
  let map = new Map("Sunny Side Up", mapData)
  setupGL(map)
  setupNavBar(map)
  hideDialog()
  console.log('up and running!')
}


main()