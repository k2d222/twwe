<script lang="ts">
  import type { Map } from '../../twmap/map'
  import type {
    ListUsers,
    ServerError,
    EditMap,
    EditTile,
    EditTileParams,
    CreateQuad,
    EditQuad,
    DeleteQuad,
    CreateEnvelope,
    EditEnvelope,
    DeleteEnvelope,
    CreateGroup,
    EditGroup,
    DeleteGroup,
    ReorderGroup,
    CreateLayer,
    EditLayer,
    DeleteLayer,
    ReorderLayer,
    CreateImage,
    DeleteImage,
  } from '../../server/protocol'
  import type { Layer } from '../../twmap/layer'
  import type { Group } from 'src/twmap/group'
  import type { RenderGroup } from 'src/gl/renderGroup'
  import type { RenderLayer } from 'src/gl/renderLayer'
  import { AnyTilesLayer, GameLayer } from '../../twmap/tilesLayer'
  import { Image } from '../../twmap/image'
  import { QuadsLayer } from '../../twmap/quadsLayer'
  import { onMount, onDestroy } from 'svelte'
  import { server } from '../global'
  import { canvas, renderer, setViewport } from '../../gl/global'
  import { Viewport } from '../../gl/viewport'
  import { RenderMap } from '../../gl/renderMap'
  import { RenderQuadsLayer } from '../../gl/renderQuadsLayer'
  import { RenderAnyTilesLayer } from '../../gl/renderTilesLayer'
  import TreeView from './treeView.svelte'
  import TileSelector from './tileSelector.svelte'
  import { showInfo, showError, clearDialog, showDialog } from './dialog'
  import QuadsView from './quadsView.svelte'
  import InfoEditor from './editInfo.svelte'
  import EnvelopeEditor from './envelopeEditor.svelte'
  import * as Editor from './editor'
  import { queryImage, externalImageUrl, px2vw, rem2px, downloadMap } from './util'
  import { Pane, Splitpanes } from 'svelte-splitpanes'
  import LayerEditor from './editLayer.svelte'
  import GroupEditor from './editGroup.svelte'
  import {
    Layers as LayersIcon,
    Activity as EnvelopesIcon,
    Save as SaveIcon,
    Play as PlayIcon,
    Pause as PauseIcon,
    Image as ImagesIcon,
    Music as SoundsIcon,
    Add as CreateGroupIcon,
  } from 'carbon-icons-svelte'
  import {
    Button,
    ComposedModal,
    ModalBody,
    ModalHeader,
    OverflowMenu,
    OverflowMenuItem,
  } from 'carbon-components-svelte'
  import { navigate } from 'svelte-routing'

  type Coord = {
    x: number
    y: number
  }

  export let map: Map

  let cont: HTMLElement
  let viewport: Viewport
  let animEnabled = false
  let currentTime = 0
  let selectedTiles: EditTileParams[][]
  let peerCount = 0
  let infoEditorVisible = false
  let active: [number, number] = map.physicsLayerIndex(GameLayer)
  let selected: [number, number][] = [active]
  let rmap = new RenderMap(map)

  // split panes
  let layerPaneSize = px2vw(rem2px(15))
  let propsPaneSize = px2vw(rem2px(20))
  let envPaneSize = 0
  let lastLayerPaneSize = layerPaneSize
  let lastPropsPaneSize = propsPaneSize
  let lastTopPaneSize = 20
  let closedPaneThreshold = px2vw(rem2px(2))

  // computed (readonly)
  let g: number, l: number
  let activeRgroup: RenderGroup | null, activeRlayer: RenderLayer | null
  let activeGroup: Group | null, activeLayer: Layer | null
  $: [g, l] = active
  $: activeRgroup = g === -1 ? null : rmap.groups[g]
  $: activeRlayer = l === -1 ? null : activeRgroup.layers[l]
  $: activeGroup = activeRgroup === null ? null : activeRgroup.group
  $: activeLayer = activeRlayer === null ? null : activeRlayer.layer

  async function onCreateLayer(e: CreateLayer) {
    showInfo('Creating layer…')
    try {
      await $server.query('createlayer', e)
      serverOnCreateLayer(e)
      clearDialog()
    } catch (e) {
      showError('Failed to create layer: ' + e)
    }
  }
  async function onDeleteLayer(e: DeleteLayer) {
    showInfo('Deleting layer…')
    try {
      await $server.query('deletelayer', e)
      serverOnDeleteLayer(e)
      clearDialog()
    } catch (e) {
      showError('Failed to delete layer: ' + e)
    }
  }
  async function onEditLayer(e: EditLayer) {
    // showInfo('Please wait…')
    try {
      await $server.query('editlayer', e)
      serverOnEditLayer(e)
      clearDialog()
    } catch (e) {
      showError('Failed to edit layer: ' + e)
    }
  }
  async function onReorderLayer(e: ReorderLayer) {
    // showInfo('Please wait…')
    try {
      await $server.query('reorderlayer', e)
      serverOnReorderLayer(e)
      clearDialog()
    } catch (e) {
      showError('Failed to reorder layer: ' + e)
    }
  }
  async function onCreateGroup() {
    const e: CreateGroup = { name: '' }
    showInfo('Creating group…')
    try {
      await $server.query('creategroup', e)
      serverOnCreateGroup(e)
      active = [map.groups.length - 1, -1]
      selected = [active]
      clearDialog()
    } catch (e) {
      showError('Failed to create group: ' + e)
    }
  }
  async function onDeleteGroup(e: DeleteGroup) {
    showInfo('Deleting group…')
    try {
      await $server.query('deletegroup', e)
      serverOnDeleteGroup(e)
      clearDialog()
    } catch (e) {
      showError('Failed to delete group: ' + e)
    }
  }
  async function onEditGroup(e: EditGroup) {
    // showInfo('Please wait…')
    try {
      await $server.query('editgroup', e)
      serverOnEditGroup(e)
      clearDialog()
    } catch (e) {
      showError('Failed to edit group: ' + e)
    }
  }
  async function onReorderGroup(e: ReorderGroup) {
    // showInfo('Please wait…')
    try {
      await $server.query('reordergroup', e)
      serverOnReorderGroup(e)
      clearDialog()
    } catch (e) {
      showError('Failed to reorder group: ' + e)
    }
  }

  function serverOnUsers(e: ListUsers) {
    peerCount = e.roomCount
  }
  function serverOnEditTile(e: EditTile) {
    rmap.editTile(e)
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
    if (activeRgroup && deleted === activeRgroup)
      active = [Math.min(map.groups.length - 1, e.group), -1]
    selected = selected.filter(([g, _]) => g !== e.group)
    rmap = rmap // hack to redraw treeview
  }
  function serverOnDeleteLayer(e: DeleteLayer) {
    const deleted = rmap.deleteLayer(e)
    if (activeRlayer && deleted === activeRlayer) {
      if (activeGroup.layers.length === 0) active = map.physicsLayerIndex(GameLayer)
      else active = [g, Math.min(activeGroup.layers.length - 1, e.layer)]
    }
    selected = selected.filter(([g, l]) => g !== e.group || l !== e.layer)
    rmap = rmap // hack to redraw treeview
  }
  function serverOnReorderGroup(e: ReorderGroup) {
    rmap.reorderGroup(e)
    if (activeLayer) active = map.layerIndex(activeLayer)
    else if (activeGroup) active = [map.groupIndex(activeGroup), -1]
    selected = [active] // TODO: keep selected layers
    rmap = rmap // hack to redraw treeview
  }
  function serverOnReorderLayer(e: ReorderLayer) {
    rmap.reorderLayer(e)
    if (activeLayer) active = map.layerIndex(activeLayer)
    selected = [active] // TODO: keep selected layers
    rmap = rmap // hack to redraw treeview
  }
  async function serverOnCreateImage(e: CreateImage) {
    if (e.external) {
      const image = new Image()
      image.loadExternal(externalImageUrl(e.name))
      image.name = e.name
      rmap.addImage(image)
    } else {
      const image = await queryImage($server, { index: e.index })
      rmap.addImage(image)
    }
  }
  function serverOnDeleteImage(e: DeleteImage) {
    rmap.removeImage(e.index)
  }
  async function serverOnEditMap(e: EditMap) {
    map.info = e.info
  }
  function serverOnError(e: ServerError) {
    if ('serverError' in e) {
      showError(
        'The server met an unexpected error. You should download or save the map, then reload the page.',
        'closable'
      )
    } else if ('mapError' in e) {
      console.error('map error', e)
      showError(
        'The server met an unexpected error and the map got corrupted. Reload the page to rollback to last save.',
        'closable'
      )
    }
  }

  function updateOutlines() {
    const { scale, pos } = viewport
    let { x, y } = viewport.mousePos
    let [offX, offY] = activeRgroup.offset()
    x = Math.floor(x - offX)
    y = Math.floor(y - offY)

    let color = 'black'
    if (
      activeLayer instanceof AnyTilesLayer &&
      (x < 0 || y < 0 || x >= activeLayer.width || y >= activeLayer.height)
    ) {
      color = 'red'
    }

    if (boxSelect || boxFill) {
      const range = Editor.normalizeRange(boxRange)
      let [x1, y1] = viewport.worldToPixel(range.start.x - offX, range.start.y)
      let [x2, y2] = viewport.worldToPixel(range.end.x + 1 - offX, range.end.y + 1)
      hoverTileStyle = `
          width: ${x2 - x1}px;
          height: ${y2 - y1}px;
          top: ${y1}px;
          left: ${x1}px;
          border-width: ${scale / 16}px;
          border-color: ${color};
        `
      boxStyle = `
          width: ${x2 - x1}px;
          height: ${y2 - y1}px;
          top: ${y1}px;
          left: ${x1}px;
          background: ${boxFill ? 'orange' : shiftKey ? 'red' : 'blue'};
        `
    } else {
      if (selectedTiles.length)
        hoverTileStyle = `
            width: ${scale * selectedTiles[0].length}px;
            height: ${scale * selectedTiles.length}px;
            top: ${(y + offY - pos.y) * scale}px;
            left: ${(x + offX - pos.x) * scale}px;
            border-width: ${scale / 16}px;
            border-color: ${color};
          `
      else
        hoverTileStyle = `
          display: none;
        `
      boxStyle = `
          display: none;
        `
    }

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
    } else {
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
    } else {
      layerOutlineStyle = `
        display: none;
      `
    }
  }

  function updateEnvelopes(t: number) {
    for (let env of map.envelopes) {
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

  function onServerClosed() {
    showError('You have been disconnected from the server.')
    navigate('/')
  }

  let destroyed = false

  onMount(() => {
    cont.prepend(canvas)
    $server.socket.addEventListener('close', onServerClosed, { once: true })
    $server.on('listusers', serverOnUsers)
    $server.on('edittile', serverOnEditTile)
    $server.on('createquad', serverOnCreateQuad)
    $server.on('editquad', serverOnEditQuad)
    $server.on('deletequad', serverOnDeleteQuad)
    $server.on('createenvelope', serverOnCreateEnvelope)
    $server.on('editenvelope', serverOnEditEnvelope)
    $server.on('deleteenvelope', serverOnDeleteEnvelope)
    $server.on('editlayer', serverOnEditLayer)
    $server.on('editgroup', serverOnEditGroup)
    $server.on('creategroup', serverOnCreateGroup)
    $server.on('createlayer', serverOnCreateLayer)
    $server.on('reordergroup', serverOnReorderGroup)
    $server.on('reorderlayer', serverOnReorderLayer)
    $server.on('deletegroup', serverOnDeleteGroup)
    $server.on('deletelayer', serverOnDeleteLayer)
    $server.on('createimage', serverOnCreateImage)
    $server.on('deleteimage', serverOnDeleteImage)
    $server.on('editmap', serverOnEditMap)
    $server.on('error', serverOnError)
    $server.send('listusers')

    viewport = new Viewport(cont, canvas)
    setViewport(viewport)

    let lastTime: DOMHighResTimeStamp = 0

    const renderLoop = (t: DOMHighResTimeStamp) => {
      if (animEnabled) {
        currentTime += t - lastTime
        updateEnvelopes(currentTime)
      }
      renderer.render(viewport, rmap)
      updateOutlines()
      lastTime = t
      if (!destroyed) requestAnimationFrame(renderLoop)
    }
    renderLoop(0)
  })

  onDestroy(() => {
    $server.socket.removeEventListener('error', onServerClosed)
    $server.off('listusers', serverOnUsers)
    $server.off('edittile', serverOnEditTile)
    $server.off('createquad', serverOnCreateQuad)
    $server.off('editquad', serverOnEditQuad)
    $server.off('deletequad', serverOnDeleteQuad)
    $server.off('createenvelope', serverOnCreateEnvelope)
    $server.off('editenvelope', serverOnEditEnvelope)
    $server.off('deleteenvelope', serverOnDeleteEnvelope)
    $server.off('editlayer', serverOnEditLayer)
    $server.off('editgroup', serverOnEditGroup)
    $server.off('creategroup', serverOnCreateGroup)
    $server.off('createlayer', serverOnCreateLayer)
    $server.off('reordergroup', serverOnReorderGroup)
    $server.off('reorderlayer', serverOnReorderLayer)
    $server.off('deletegroup', serverOnDeleteGroup)
    $server.off('deletelayer', serverOnDeleteLayer)
    $server.off('createimage', serverOnCreateImage)
    $server.off('deleteimage', serverOnDeleteImage)
    $server.off('editmap', serverOnEditMap)
    $server.off('error', serverOnError)
    destroyed = true
  })

  function onToggleLayerPanes() {
    if (layerPaneSize < closedPaneThreshold || propsPaneSize < closedPaneThreshold) {
      layerPaneSize = lastLayerPaneSize
      propsPaneSize = lastPropsPaneSize
    } else {
      lastLayerPaneSize = layerPaneSize
      lastPropsPaneSize = propsPaneSize
      layerPaneSize = 0
      propsPaneSize = 0
    }
  }

  function onToggleTopPane() {
    if (envPaneSize < closedPaneThreshold) {
      envPaneSize = lastTopPaneSize
    } else {
      lastTopPaneSize = envPaneSize
      envPaneSize = 0
    }
  }

  function onToggleAnim() {
    animEnabled = !animEnabled
    if (!animEnabled) updateEnvelopes(0)
  }

  async function onSaveMap() {
    try {
      showInfo('Saving map...', 'none')
      await $server.query('savemap', { name: map.name })
      showInfo('Map saved on the server.', 'closable')
    } catch (e) {
      showError('Failed to save map: ' + e)
    }
  }

  function onDownloadMap() {
    downloadMap($server, map.name)
  }

  function onRenameMap() {
    alert('TODO renaming maps is not yet implemented.')
  }

  function onLeaveMap() {
    navigate('/')
  }

  async function onDeleteMap() {
    if (peerCount !== 1) {
      showError('Cannot delete map: other users are connected')
      return
    }

    const res = await showDialog('warning', 'Are you sure you want to delete this map?', 'yesno')

    if (res)
      try {
        await $server.query('leavemap', null)
        await $server.query('deletemap', { name: map.name })
        navigate('/')
      } catch (e) {
        showError('Map deletion failed: ' + e)
      }
  }

  // let ctrlKey = false
  let shiftKey = false

  function onKeyDown(e: KeyboardEvent) {
    // ctrlKey = e.ctrlKey
    shiftKey = e.shiftKey

    const target = e.target as HTMLElement
    if (!target.contains(canvas)) return

    Editor.fire('keydown', e)

    if (e.ctrlKey && ['s', 'd', ' '].includes(e.key)) {
      e.preventDefault()

      if (e.key === 's') {
        onSaveMap()
      } else if (e.key === ' ') {
        onToggleAnim()
      }
    } else if (['Tab'].includes(e.key)) {
      e.preventDefault()

      if (e.key === 'Tab') {
        onToggleLayerPanes()
      }
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    // ctrlKey = e.ctrlKey
    shiftKey = e.shiftKey

    const target = e.target as HTMLElement
    if (!target.contains(canvas)) return

    Editor.fire('keyup', e)
  }

  function onKeyPress(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    if (!target.contains(canvas)) return

    Editor.fire('keypress', e)
  }

  let hoverTileStyle = ''
  let layerOutlineStyle = ''
  let clipOutlineStyle = ''
  let boxStyle = ''

  let boxSelect = false // visual box when selecting an area
  let boxFill = false // visual box when using shift+drag (fill a rect with brush)
  let boxRange: Editor.Range = {
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
  }
  let lastPos = { x: 0, y: 0 }

  function worldPosToTileCoord(pos: Coord): Coord {
    const [offX, offY] = activeRgroup.offset()
    return {
      x: Math.floor(pos.x - offX),
      y: Math.floor(pos.y - offY),
    }
  }

  function onMouseDown(e: MouseEvent) {
    if (activeLayer instanceof AnyTilesLayer) {
      const curPos = worldPosToTileCoord(viewport.mousePos)
      if (e.buttons === 1) {
        if (!e.ctrlKey && !e.shiftKey && selectedTiles.length !== 0) {
          Editor.placeTiles($server, rmap, g, l, curPos, selectedTiles)
        } else if (e.shiftKey && selectedTiles.length !== 0) {
          boxRange.start = curPos
          boxRange.end = curPos
          boxFill = true
        } else if (selectedTiles.length === 0) {
          boxRange.start = curPos
          boxRange.end = curPos
          boxSelect = true
        }
      }
      lastPos = curPos
    }
  }

  function onMouseMove(e: MouseEvent) {
    if (activeLayer instanceof AnyTilesLayer) {
      const curPos = worldPosToTileCoord(viewport.mousePos)
      if (e.buttons === 1 && !e.ctrlKey) {
        if (!boxFill && !boxSelect && !e.shiftKey) {
          Editor.drawLine($server, rmap, g, l, lastPos, curPos, selectedTiles)
        } else if (boxFill || boxSelect) {
          boxRange.end = curPos
        }
      }
      lastPos = curPos
    }
  }

  function onMouseUp(e: MouseEvent) {
    if (activeLayer instanceof AnyTilesLayer) {
      if (boxSelect || boxFill) {
        const curPos = worldPosToTileCoord(viewport.mousePos)
        boxRange.end = curPos
        boxRange = Editor.normalizeRange(boxRange)

        if (boxSelect && !e.shiftKey) {
          selectedTiles = Editor.makeBoxSelection(activeLayer, boxRange)
          boxSelect = false
        } else if (boxSelect && e.shiftKey) {
          const brush = Editor.makeEmptySelection(activeLayer, boxRange)
          Editor.placeTiles($server, rmap, g, l, boxRange.start, brush)
          selectedTiles = []
          boxSelect = false
        } else if (boxFill) {
          Editor.fill($server, rmap, g, l, boxRange, selectedTiles)
          boxFill = false
        }
      }
    }
  }

  function onContextMenu(e: MouseEvent) {
    e.preventDefault()
    selectedTiles = []
  }

  function onEditInfo() {
    infoEditorVisible = !infoEditorVisible
  }

  async function onInfoClose() {
    infoEditorVisible = false
    try {
      // showInfo('Please wait…')
      const change: EditMap = {
        info: map.info,
      }
      const res = await $server.query('editmap', change)
      map.info = res.info
      clearDialog()
    } catch (e) {
      showError('Failed to edit map info: ' + e)
    }
  }
</script>

<svelte:window on:keydown={onKeyDown} on:keyup={onKeyUp} on:keypress={onKeyPress} />

<div id="editor">
  <div id="header">
    <div class="left">
      <button class="header-btn" id="nav-toggle" on:click={onToggleLayerPanes}>
        <LayersIcon size={20} title="Layers" />
      </button>
      <button class="header-btn" id="env-toggle" on:click={onToggleTopPane}>
        <EnvelopesIcon size={20} title="Envelopes" />
      </button>
      <button class="header-btn" id="images-toggle" disabled>
        <ImagesIcon size={20} title="Images" />
      </button>
      <button class="header-btn" id="sounds-toggle" disabled>
        <SoundsIcon size={20} title="Sounds" />
      </button>
      <button class="header-btn" id="save" on:click={onSaveMap}>
        <SaveIcon size={20} title="Save map on server" />
      </button>
      <button class="header-btn" id="anim-toggle" on:click={onToggleAnim}>
        <svelte:component
          this={animEnabled ? PauseIcon : PlayIcon}
          size={20}
          title="Play/Pause envelopes animations"
        />
      </button>
      <OverflowMenu class="header-btn" iconDescription="Map settings">
        <OverflowMenuItem text="Properties" hasDivider on:click={onEditInfo} />
        <OverflowMenuItem text="Rename" on:click={onRenameMap} />
        <OverflowMenuItem text="Download" on:click={onDownloadMap} />
        <OverflowMenuItem text="Leave" on:click={onLeaveMap} />
        <OverflowMenuItem danger text="Delete" hasDivider on:click={onDeleteMap} />
      </OverflowMenu>
    </div>
    <div class="middle">
      <span id="map-name">{map.name}</span>
    </div>
    <div class="right">
      <div id="users">
        Users online: <span>{peerCount}</span>
      </div>
    </div>
  </div>

  <Splitpanes horizontal id="panes" dblClickSplitter={false}>
    <Pane size={100 - envPaneSize}>
      <Splitpanes dblClickSplitter={false}>
        <Pane class="layers" bind:size={layerPaneSize}>
          <TreeView {rmap} bind:active bind:selected />
          <Button
            id="create-group"
            size="field"
            kind="ghost"
            icon={CreateGroupIcon}
            on:click={onCreateGroup}
          >
            Add group
          </Button>
        </Pane>

        <Pane class="viewport" size={100 - layerPaneSize - propsPaneSize}>
          <div
            id="canvas-container"
            bind:this={cont}
            on:mousedown={onMouseDown}
            on:mouseup={onMouseUp}
            on:mousemove={onMouseMove}
            on:contextmenu={onContextMenu}
          >
            <!-- Here goes the canvas on mount() -->
            <div id="clip-outline" style={clipOutlineStyle} />
            {#if activeLayer instanceof AnyTilesLayer}
              <div id="hover-tile" style={hoverTileStyle} />
              <div id="layer-outline" style={layerOutlineStyle} />
            {:else if activeLayer instanceof QuadsLayer}
              <QuadsView {rmap} layer={activeLayer} />
            {/if}
            <div class="box-select" style={boxStyle} />
            <!-- <Statusbar /> -->
          </div>
          {#if activeRlayer instanceof RenderAnyTilesLayer}
            <TileSelector rlayer={activeRlayer} bind:selected={selectedTiles} />
          {/if}
        </Pane>

        <Pane class="properties" bind:size={propsPaneSize}>
          {#if activeLayer !== null}
            <LayerEditor
              {rmap}
              {g}
              {l}
              on:deletelayer={e => onDeleteLayer(e.detail)}
              on:editlayer={e => onEditLayer(e.detail)}
              on:reorderlayer={e => onReorderLayer(e.detail)}
            />
          {:else if activeGroup !== null}
            <GroupEditor
              {rmap}
              {g}
              on:createlayer={e => onCreateLayer(e.detail)}
              on:deletegroup={e => onDeleteGroup(e.detail)}
              on:editgroup={e => onEditGroup(e.detail)}
              on:reordergroup={e => onReorderGroup(e.detail)}
            />
          {:else}
            <span>Select a group or a layer in the left bar.</span>
          {/if}
        </Pane>
      </Splitpanes>
    </Pane>

    <Pane bind:size={envPaneSize}>
      <EnvelopeEditor {rmap} />
    </Pane>
  </Splitpanes>

  <ComposedModal
    open={infoEditorVisible}
    on:close={onInfoClose}
    selectorPrimaryFocus=".bx--modal-close"
  >
    <ModalHeader title="Map Properties" />
    <ModalBody hasForm>
      <InfoEditor info={map.info} />
    </ModalBody>
  </ComposedModal>
</div>
