<script lang="ts">
  import type { Map } from '../../twmap/map'
  import type {
    ListUsers, ServerError,
    EditTile, EditTileParams,
    CreateQuad, EditQuad, DeleteQuad,
    CreateEnvelope, EditEnvelope, DeleteEnvelope,
    CreateGroup,  EditGroup, DeleteGroup, ReorderGroup,
    CreateLayer, EditLayer, DeleteLayer, ReorderLayer,
    CreateImage, DeleteImage,
  } from '../../server/protocol'
  import type { Layer } from '../../twmap/layer'
  import { AnyTilesLayer, GameLayer } from '../../twmap/tilesLayer'
  import { Image } from '../../twmap/image'
  import { QuadsLayer } from '../../twmap/quadsLayer'
  import { ColorEnvelope, PositionEnvelope, SoundEnvelope } from '../../twmap/envelope'
  import { onMount, onDestroy } from 'svelte'
  import { server } from '../global'
  import { canvas, renderer, setViewport } from '../../gl/global'
  import { Viewport } from '../../gl/viewport'
  import { RenderMap } from '../../gl/renderMap'
  import { RenderQuadsLayer } from '../../gl/renderQuadsLayer'
  import TreeView from './treeView.svelte'
  import TileSelector from './tileSelector.svelte'
  import { showInfo, showError } from './dialog'
  import Statusbar from './statusbar.svelte'
  import QuadsView from './quadsView.svelte'
  import EnvelopeEditor from './envelopeEditor.svelte'
  import * as Editor from './editor'
  import { queryImage, externalImageUrl, layerIndex } from './util'

  export let map: Map

  let cont: HTMLElement
  let viewport: Viewport
  let treeViewVisible = true
  let envEditorVisible = false
  let animEnabled = false
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
    activeRlayer = activeRlayer // WTF
  }

  function serverOnUsers(e: ListUsers) {
    peerCount = e.roomCount
  }

  function serverOnEditTile(e: EditTile) {
    rmap.editTile(e)
    // rmap = rmap // hack to redraw treeview
  }
  function serverOnCreateQuad(e: CreateQuad) {
    rmap.createQuad(e)
    activeLayer = activeLayer // hack to redraw quadview
  }
  function serverOnEditQuad(e: EditQuad) {
    rmap.editQuad(e)
    activeLayer = activeLayer // hack to redraw quadview
  }
  function serverOnDeleteQuad(e: DeleteQuad) {
    rmap.deleteQuad(e)
    activeLayer = activeLayer // hack to redraw quadview
  }
  function serverOnCreateEnvelope(e: CreateEnvelope) {
    rmap.createEnvelope(e)
    rmap = rmap // hack to redraw env editor
  }
  function serverOnEditEnvelope(e: EditEnvelope) {
    rmap.editEnvelope(e)
    rmap = rmap // hack to redraw env editor
  }
  function serverOnDeleteEnvelope(e: DeleteEnvelope) {
    rmap.removeEnvelope(e.index)
    rmap = rmap // hack to redraw env editor
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
  
  function updateEnvelopes(t: number) {
    for(let env of map.envelopes) {
      env.update(t)
    }
    for (const rgroup of rmap.groups) {
      for (const rlayer of rgroup.layers) {
        if (rlayer instanceof RenderQuadsLayer) {
          rlayer.recomputeEnvelope() // COMBAK: maybe better perfs?
        }
      }
    }
  }

  let destroyed = false

  onMount(() => {
    cont.prepend(canvas)
    server.on('listusers', serverOnUsers)
    server.on('edittile', serverOnEditTile)
    server.on('createquad', serverOnCreateQuad)
    server.on('editquad', serverOnEditQuad)
    server.on('deletequad', serverOnDeleteQuad)
    server.on('createenvelope', serverOnCreateEnvelope)
    server.on('editenvelope', serverOnEditEnvelope)
    server.on('deleteenvelope', serverOnDeleteEnvelope)
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

    // canvas.tabIndex = 1 // make canvas focusable to catch keyboard events
    // canvas.addEventListener('keydown', onKeyDown)
    // canvas.focus()
    
    viewport = new Viewport(cont, canvas)
    setViewport(viewport)

    const renderLoop = (t: number) => {
      if (animEnabled)
        updateEnvelopes(t)
      renderer.render(viewport, rmap)
      updateOutlines()
      if (!destroyed)
        requestAnimationFrame(renderLoop)
    }
    renderLoop(0)
  })

  onDestroy(() => {
    server.off('listusers', serverOnUsers)
    server.off('edittile', serverOnEditTile)
    server.off('createquad', serverOnCreateQuad)
    server.off('editquad', serverOnEditQuad)
    server.off('deletequad', serverOnDeleteQuad)
    server.off('createenvelope', serverOnCreateEnvelope)
    server.off('editenvelope', serverOnEditEnvelope)
    server.off('deleteenvelope', serverOnDeleteEnvelope)
    server.off('editlayer', serverOnEditLayer)
    server.off('editgroup', serverOnEditGroup)
    server.off('creategroup', serverOnCreateGroup)
    server.off('createlayer', serverOnCreateLayer)
    server.off('reordergroup', serverOnReorderGroup)
    server.off('reorderlayer', serverOnReorderLayer)
    server.off('deletegroup', serverOnDeleteGroup)
    server.off('deletelayer', serverOnDeleteLayer)
    server.off('createimage', serverOnCreateImage)
    server.off('deleteimage', serverOnDeleteImage)
    server.off('error', serverOnError)
    canvas.removeEventListener('keydown', onKeyDown)
    destroyed = true
  })

  function onToggleTreeView() {
    treeViewVisible = !treeViewVisible
  }

  function onToggleEnvEditor() {
    envEditorVisible = !envEditorVisible
  }

  function onToggleAnim() {
    animEnabled = !animEnabled
    if (!animEnabled)
      updateEnvelopes(0)
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
  
  let lastTreeViewVisible = treeViewVisible
  let lastEnvEditorVisible = envEditorVisible

  function onKeyDown(e: KeyboardEvent) {
    if ([' ', 'Tab'].includes(e.key)) {
      e.preventDefault()

      if (e.key === ' ')
        tileSelectorVisible = !tileSelectorVisible
      else if (e.key === 'Tab') {
        if (treeViewVisible || envEditorVisible) {
          lastTreeViewVisible = treeViewVisible
          lastEnvEditorVisible = envEditorVisible
          treeViewVisible = false
          envEditorVisible = false
        }
        else {
          treeViewVisible = lastTreeViewVisible
          envEditorVisible = lastEnvEditorVisible
        }
      }
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

  <div bind:this={cont} tabindex={1} on:keydown={onKeyDown} on:mousemove={onMouseMove}>
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
      <button id="env-toggle" on:click={onToggleEnvEditor}><img src="/assets/envelope.svg" alt="" title="Show envelopes"></button>
      <button id="save" on:click={onSaveMap}><img src="/assets/save.svg" alt="" title="Save the map on the server">Save</button>
      <button id="download" on:click={onDownloadMap}><img src="/assets/download.svg" alt="" title="Download this map to your computer">Download</button>
      {#if animEnabled}
        <button id="anim-toggle" on:click={onToggleAnim}><img src="/assets/pause.svg" alt="pause" title="Pause envelope animations"></button>
      {:else}
        <button id="anim-toggle" on:click={onToggleAnim}><img src="/assets/play.svg" alt="play" title="Play envelope animations"></button>
      {/if}
    </div>
    <div class="middle">
      <span id="map-name">{map.name}</span>
    </div>
    <div class="right">
      <div id="users">Users online: <span>{peerCount}</span></div>
    </div>
  </div>

  <TreeView visible={treeViewVisible} {rmap} bind:activeLayer={activeLayer} />

  <EnvelopeEditor visible={envEditorVisible} {rmap} />

</div>
