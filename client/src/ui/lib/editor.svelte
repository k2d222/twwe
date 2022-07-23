<script lang="ts">
  import type { Map } from '../../twmap/map'
  import type { ListUsers, EditTile, EditGroup, EditLayer, CreateLayer, CreateGroup, DeleteLayer, DeleteGroup, ReorderLayer, ReorderGroup, CreateImage, DeleteImage, ServerError, EditTileParams } from '../../server/protocol'
  import type { Layer } from '../../twmap/layer'
  import { AnyTilesLayer, GameLayer } from '../../twmap/tilesLayer'
  import { Image } from '../../twmap/image'
  import { QuadsLayer } from '../../twmap/quadsLayer'
  import { onMount, onDestroy } from 'svelte'
  import { server } from '../global'
  import { canvas, renderer, setViewport } from '../../gl/global'
  import { Viewport } from '../../gl/viewport'
  import { RenderMap } from '../../gl/renderMap'
  import TreeView from './treeView.svelte'
  import TileSelector from './tileSelector.svelte'
  import { showInfo, showError } from './dialog'
  import Statusbar from './statusbar.svelte'
  import QuadsView from './quadsView.svelte'
  import * as Editor from './editor'
  import { queryImage, externalImageUrl, layerIndex } from './util'

  export let map: Map

  let cont: HTMLElement
  let viewport: Viewport
  let treeViewVisible = true
  let selectedTile: EditTileParams
  let peerCount = 0
  let tileSelectorVisible = false
  let activeLayer: Layer = map.physicsLayer(GameLayer)
  let rmap = new RenderMap(map)

  $: [ g, l ] = layerIndex(map, activeLayer)
  $: activeRlayer = rmap.groups[g].layers[l]
  $: activeRgroup = rmap.groups[g]

  $: {
    for (const rgroup of rmap.groups) {
      rgroup.active = false
      for (const rlayer of rgroup.layers) {
        rlayer.active = false
      }
    }
    activeRlayer.active = true
    activeRgroup.active = true
  }

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
    const deleted = rmap.deleteGroup(e)
    if (deleted.layers.includes(activeRlayer))
      activeLayer = rmap.gameLayer.layer
    rmap = rmap // hack to redraw treeview
  }
  function serverOnDeleteLayer(e: DeleteLayer) {
    const deleted = rmap.deleteLayer(e)
    if (deleted === activeRlayer)
      activeLayer = rmap.gameLayer.layer
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
    const { scale, pos } = viewport
    let { x, y } = viewport.mousePos
    let [ offX, offY ] = activeRgroup.offset()
    x = Math.floor(x - offX)
    y = Math.floor(y - offY)

    let color = 'black'
    if (activeLayer instanceof AnyTilesLayer && (x < 0 || y < 0 || x >= activeLayer.width || y >= activeLayer.height)) {
      color = 'red'
    }

    hoverTileStyle = `
      width: ${scale}px;
      height: ${scale}px;
      top: ${(y + offY - pos.y) * scale}px;
      left: ${(x + offX - pos.x) * scale}px;
      border-width: ${scale / 16}px;
      border-color: ${color};
    `
    
    if (activeRgroup.group.clipping) {
      let { clipX, clipY, clipW, clipH } = activeRgroup.group
      clipX /= 32
      clipY /= 32
      clipW /= 32
      clipH /= 32
      clipOutlineStyle = `
        width: ${clipW * scale}px;
        height: ${clipH * scale}px;
        top: ${(clipY - pos.y) * scale}px;
        left: ${(clipX - pos.x) * scale}px;
      `
    }
    else {
      clipOutlineStyle = `
        display: none;
      `
    }

    if (activeLayer instanceof AnyTilesLayer) {
      layerOutlineStyle = `
        width: ${activeLayer.width * scale}px;
        height: ${activeLayer.height * scale}px;
        top: ${(-pos.y + offY) * scale}px;
        left: ${-(pos.x - offX) * scale}px;
      `
    }
    else {
      layerOutlineStyle = `
        display: none;
      `
    }
  }

  let destroyed = false

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

    canvas.tabIndex = 1 // make canvas focusable to catch keyboard events
    canvas.addEventListener('keydown', onKeyDown)
    canvas.focus()
    
    viewport = new Viewport(cont, canvas)
    setViewport(viewport)

    const renderLoop = () => {
      renderer.render(viewport, rmap)
      updateOutlines()
      if (!destroyed)
        requestAnimationFrame(renderLoop)
    }
    renderLoop()
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
    canvas.removeEventListener('keydown', onKeyDown)
    destroyed = true
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
  let clipOutlineStyle = ''

  function onMouseMove(e: MouseEvent) {
    if (activeLayer instanceof AnyTilesLayer) {
      // left button pressed
      if (e.buttons === 1 && !e.ctrlKey) {
        Editor.placeTile(rmap, g, l, selectedTile)
      }
      else if (e.buttons === 0) {
        Editor.release()
      }
    }
  }

</script>

<div id="editor">

  <div bind:this={cont} on:mousemove={onMouseMove}>
    <!-- Here goes the canvas on mount() -->
    <div id="clip-outline" style={clipOutlineStyle}></div>
    {#if activeLayer instanceof AnyTilesLayer}
      <div id="hover-tile" style={hoverTileStyle}></div>
      <div id="layer-outline" style={layerOutlineStyle}></div>
      <TileSelector rlayer={activeRlayer} bind:selected={selectedTile} bind:tilesVisible={tileSelectorVisible} />
    {:else if activeLayer instanceof QuadsLayer}
      <QuadsView {rmap} layer={activeLayer} />
    {/if}
    <Statusbar />
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

  <TreeView visible={treeViewVisible} {rmap} bind:activeLayer={activeLayer} />

</div>
