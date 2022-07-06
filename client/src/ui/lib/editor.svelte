<script lang="ts">
  import type { Map } from '../../twmap/map'
  import type { ListUsers, EditTile, EditGroup, EditLayer, CreateLayer, CreateGroup, DeleteLayer, DeleteGroup, ReorderLayer, ReorderGroup, AddImage } from '../../server/protocol'
  import { TileLayer } from '../../twmap/tileLayer'
  import { onMount, onDestroy } from 'svelte'
  import { server } from '../global'
  import { viewport } from '../../gl/global'
  import TreeView from './treeView.svelte'
  import TileSelector from './tileSelector.svelte'
  import { showInfo } from './dialog'
  import Statusbar from './statusbar.svelte'
  import * as Editor from './editor'
  import { queryImage } from './util'

  export let map: Map

  let cont: HTMLElement

  let canvas = document.createElement('canvas')
  let rmap = Editor.createRenderMap(canvas, map)

  canvas.tabIndex = 1 // make canvas focusable to catch keyboard events
  canvas.addEventListener('keydown', onKeyDown)

  let treeViewVisible = true
  let selectedLayer = map.gameLayerID()
  let selectedID = 0
  let peerCount = 0

  let tileSelectorVisible = false
  $: tileSelectorImg = Editor.getLayerImage(rmap, ...selectedLayer)

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
    rmap.deleteGroup(e)
    rmap = rmap // hack to redraw treeview
  }
  function serverOnDeleteLayer(e: DeleteLayer) {
    rmap.deleteLayer(e)
    rmap = rmap // hack to redraw treeview
  }
  function serverOnReorderGroup(e: ReorderGroup) {
    rmap.reorderGroup(e)
    rmap = rmap // hack to redraw treeview
  }
  function serverOnReorderLayer(e: ReorderLayer) {
    rmap.reorderLayer(e)
    rmap = rmap // hack to redraw treeview
  }
  async function serverOnAddImage(e: AddImage) {
    // fetch missing images...
    const image = await queryImage({ index: e.index })
    rmap.addImage(image)
  }

  function updateOutlines() {
    const layer = map.groups[selectedLayer[0]].layers[selectedLayer[1]]
    const { scale, pos } = viewport
    let { x, y } = viewport.mousePos
    x = Math.floor(x)
    y = Math.floor(y)

    let color = 'black'
    if (layer instanceof TileLayer && (x < 0 || y < 0 || x > layer.width || y > layer.height)) {
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

    if (layer instanceof TileLayer) {
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
    server.on('addimage', serverOnAddImage)
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
    showInfo('Saving map...', 'none')
    await server.query('savemap', { name: map.name })
    showInfo('Map saved on server.', 'closable')
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
      Editor.placeTile(rmap, ...selectedLayer, selectedID)
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
  <TreeView visible={treeViewVisible} {rmap} bind:selected={selectedLayer} />
  <TileSelector image={tileSelectorImg} bind:selected={selectedID} bind:visible={tileSelectorVisible} />
</div>
