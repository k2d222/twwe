<script lang="ts">
  import type { Map } from '../../twmap/map'
  import type { ListUsers, EditTile, EditGroup, EditLayer, CreateLayer, CreateGroup, DeleteLayer, DeleteGroup, ReorderLayer, ReorderGroup, CreateImage, DeleteImage, ServerError, EditTileParams } from '../../server/protocol'
  import { AnyTilesLayer, TilesLayer, GameLayer } from '../../twmap/tilesLayer'
  import { Image } from '../../twmap/image'
  import { onMount, onDestroy } from 'svelte'
  import { server } from '../global'
  import { viewport } from '../../gl/global'
  import TreeView from './treeView.svelte'
  import TileSelector from './tileSelector.svelte'
  import { showInfo, showError } from './dialog'
  import Statusbar from './statusbar.svelte'
  import * as Editor from './editor'
  import { queryImage, externalImageUrl } from './util'

  export let map: Map

  let cont: HTMLElement

  let canvas = document.createElement('canvas')
  let rmap = Editor.createRenderMap(canvas, map)

  canvas.tabIndex = 1 // make canvas focusable to catch keyboard events
  canvas.addEventListener('keydown', onKeyDown)

  let treeViewVisible = true
  const gameLayer = map.physicsLayerIndex(GameLayer)
  let g = gameLayer[0]
  let l = gameLayer[1]
  let selectedTile: EditTileParams
  let peerCount = 0
  let tileSelectorVisible = false

  function serverOnUsers(e: ListUsers) {
    peerCount = e.roomCount
  }

  function serverOnEditTile(e: EditTile) {
    rmap.editTile(e)
    rmap = rmap // hack to redraw treeview
  }
  function serverOnEditGroup(e: EditGroup) {
    rmap.editGroup(e)
    rmap = rmap // hack to redraw treeview
  }
  async function serverOnEditLayer(e: EditLayer) {
    rmap.editLayer(e)
    rmap = rmap // hack to redraw treeview
  }
  function serverOnCreateGroup(e: CreateGroup) {
    rmap.createGroup(e)
    rmap = rmap // hack to redraw treeview
  }
  function serverOnCreateLayer(e: CreateLayer) {
    rmap.createLayer(e)
    rmap = rmap // hack to redraw treeview
  }
  function serverOnDeleteGroup(e: DeleteGroup) {
    const group = rmap.groups[g]
    rmap.deleteGroup(e)
    if (e.group === g) {
      g = -1
      l = -1
    }
    else {
      g = rmap.groups.indexOf(group)
    }
    rmap = rmap // hack to redraw treeview
  }
  function serverOnDeleteLayer(e: DeleteLayer) {
    const layer = rmap.groups[g].layers[l]
    rmap.deleteLayer(e)
    if (e.group === g && e.layer === l) {
      g = -1
      l = -1
    }
    else {
      const newGroup = rmap.groups.find(g => g.layers.includes(layer))
      g = rmap.groups.indexOf(newGroup)
      l = newGroup.layers.indexOf(layer)
    }
    rmap = rmap // hack to redraw treeview
  }
  function serverOnReorderGroup(e: ReorderGroup) {
    const group = rmap.groups[g]
    rmap.reorderGroup(e)
    g = rmap.groups.indexOf(group)
    rmap = rmap // hack to redraw treeview
  }
  function serverOnReorderLayer(e: ReorderLayer) {
    const layer = rmap.groups[g].layers[l]
    rmap.reorderLayer(e)
    const newGroup = rmap.groups.find(g => g.layers.includes(layer))
    g = rmap.groups.indexOf(newGroup)
    l = newGroup.layers.indexOf(layer)
    rmap = rmap // hack to redraw treeview
  }
  async function serverOnCreateImage(e: CreateImage) {
    if (e.external) {
      const image = new Image()
      image.loadExternal(externalImageUrl(e.name))
      image.name = e.name
      rmap.addImage(image)
    }
    else {
      const image = await queryImage({ index: e.index })
      rmap.addImage(image)
    }
  }
  async function serverOnDeleteImage(e: DeleteImage) {
    rmap.removeImage(e.index)
  }
  function serverOnError(e: ServerError) {
    if ('serverError' in e) {
      showError('The server met an unexpected error. You should download or save the map, then reload the page.', 'closable')
    }
    else if ('mapError' in e) {
      console.error('map error', e)
      showError('The server met an unexpected error and the map got corrupted. Reload the page to rollback to last save.', 'closable')
    }
  }

  function updateOutlines() {
    const layer = map.groups[g].layers[l]
    const { scale, pos } = viewport
    let { x, y } = viewport.mousePos
    x = Math.floor(x)
    y = Math.floor(y)

    let color = 'black'
    if (layer instanceof TilesLayer && (x < 0 || y < 0 || x > layer.width || y > layer.height)) {
      color = 'red'
    }

    hoverTileStyle = `
      width: ${scale}px;
      height: ${scale}px;
      top: ${(y - pos.y) * scale}px;
      left: ${(x - pos.x) * scale}px;
      border-width: ${scale / 16}px;
      border-color: ${color};
    `

    if (layer instanceof AnyTilesLayer) {
      layerOutlineStyle = `
        width: ${layer.width * scale}px;
        height: ${layer.height * scale}px;
        top: ${-pos.y * scale}px;
        left: ${-pos.x * scale}px;
      `
    }
    else {
      layerOutlineStyle = `
        display: none;
      `
    }
  }

  onMount(() => {
    cont.prepend(canvas)
    server.on('listusers', serverOnUsers)
    server.on('edittile', serverOnEditTile)
    server.on('editlayer', serverOnEditLayer)
    server.on('editgroup', serverOnEditGroup)
    server.on('creategroup', serverOnCreateGroup)
    server.on('createlayer', serverOnCreateLayer)
    server.on('reordergroup', serverOnReorderGroup)
    server.on('reorderlayer', serverOnReorderLayer)
    server.on('deletegroup', serverOnDeleteGroup)
    server.on('deletelayer', serverOnDeleteLayer)
    server.on('createimage', serverOnCreateImage)
    server.on('deleteimage', serverOnDeleteImage)
    server.on('error', serverOnError)
    server.send('listusers')
    canvas.focus()
    
    // this is me being lazy, but really there are many events that should
    // toggle a redraw of the outlines, such as mouse move, view move, zoom,
    // change active layer, resize layers...
    const updateForever = () => {
      updateOutlines()
      requestAnimationFrame(updateForever)
    }
    updateForever()
  })

  onDestroy(() => {
    server.off('listusers', serverOnUsers)
    server.off('edittile', serverOnEditTile)
    server.off('editlayer', serverOnEditLayer)
    server.off('editgroup', serverOnEditGroup)
    server.off('creategroup', serverOnCreateGroup)
    server.off('createlayer', serverOnCreateLayer)
    server.off('reordergroup', serverOnReorderGroup)
    server.off('reorderlayer', serverOnReorderLayer)
    server.off('deletegroup', serverOnDeleteGroup)
    server.off('deletelayer', serverOnDeleteLayer)
  })

  function onToggleTreeView() {
    treeViewVisible = !treeViewVisible
  }

  async function onSaveMap() {
    try {
      showInfo('Saving map...', 'none')
      await server.query('savemap', { name: map.name })
      showInfo('Map saved on server.', 'closable')
    }
    catch (e) {
      showError('Failed to save map: ' + e)
    }
  }

  function onDownloadMap() {
    Editor.downloadMap(map.name)
  }

  function onKeyDown(e: KeyboardEvent) {
    if ([' ', 'Tab'].includes(e.key)) {
      e.preventDefault()

      if (e.key === ' ')
        tileSelectorVisible = !tileSelectorVisible
      else if (e.key === 'Tab')
        onToggleTreeView()
    }
  }
  
  let hoverTileStyle = ''
  let layerOutlineStyle = ''

  function onMouseMove(e: MouseEvent) {
    // left button pressed
    if (e.buttons === 1 && !e.ctrlKey) {
      Editor.placeTile(rmap, g, l, selectedTile)
    }
  }


</script>

<div id="editor">
  <div bind:this={cont} on:mousemove={onMouseMove}>
    <div id="hover-tile" style={hoverTileStyle}></div>
    <div id="layer-outline" style={layerOutlineStyle}></div>
  </div>
  <div id="menu">
    <div class="left">
      <button id="nav-toggle" on:click={onToggleTreeView}><img src="/assets/tree.svg" alt="" title="Show layers"></button>
      <button id="save" on:click={onSaveMap}><img src="/assets/save.svg" alt="" title="Save the map on the server">Save</button>
      <button id="download" on:click={onDownloadMap}><img src="/assets/download.svg" alt="" title="Download this map to your computer">Download</button>
    </div>
    <div class="middle">
      <span id="map-name">{map.name}</span>
    </div>
    <div class="right">
      <div id="users">Users online: <span>{peerCount}</span></div>
    </div>
  </div>
  <Statusbar />
  <TreeView visible={treeViewVisible} {rmap} bind:g={g} bind:l={l} />
  <TileSelector {rmap} {g} {l} bind:selected={selectedTile} bind:tilesVisible={tileSelectorVisible} />
</div>
