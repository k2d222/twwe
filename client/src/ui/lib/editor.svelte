<script lang="ts">
  import type {
    ServerError,
    EditMap,
    EditTile,
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
ListUsers,
EditTiles,
  } from '../../server/protocol'
  import type { Layer } from '../../twmap/layer'
  import type { Group } from '../../twmap/group'
  import { LayerType } from '../../twmap/types'
  import type { RenderGroup } from '../../gl/renderGroup'
  import type { RenderLayer } from '../../gl/renderLayer'
  import { GameLayer } from '../../twmap/tilesLayer'
  import { Image } from '../../twmap/image'
  import { onMount, onDestroy } from 'svelte'
  import { server, serverConfig, rmap, selected } from '../global'
  import { canvas } from '../../gl/global'
  import TreeView from './treeView.svelte'
  import { showInfo, showError, clearDialog, showDialog } from './dialog'
  import InfoEditor from './editInfo.svelte'
  import EnvelopeEditor from './envelopeEditor.svelte'
  import * as Editor from './editor'
  import { externalImageUrl, px2vw, rem2px, downloadMap, queryImageData } from './util'
  import { Pane, Splitpanes } from 'svelte-splitpanes'
  import LayerEditor from './editLayer.svelte'
  import GroupEditor from './editGroup.svelte'
  import Viewport from './viewport.svelte'
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
  import { dataToTiles } from '../../server/convert'
  import type * as MapDir from '../../twmap/mapdir'

  // let viewport: Viewport
  let animEnabled = false
  let peerCount = 0
  let infoEditorVisible = false

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
  $: {
    if ($selected.length === 0) {
      g = -1
      l = -1
    }
    else {
      g = $selected[$selected.length - 1][0]
      l = $selected[$selected.length - 1][1]
    }
  }
  let activeRgroup: RenderGroup | null, activeRlayer: RenderLayer | null
  let activeGroup: Group | null, activeLayer: Layer | null
  $: ll = $selected.map(([_, l]) => l).filter(l => l !== -1 && $rmap.map.groups[g].layers[l].type === LayerType.TILES)
  $: activeRgroup = g === -1 ? null : $rmap.groups[g]
  $: activeRlayer = l === -1 ? null : activeRgroup.layers[l]
  $: activeGroup = activeRgroup === null ? null : activeRgroup.group
  $: activeLayer = activeRlayer === null ? null : activeRlayer.layer
  $: $rmap.setActiveLayer(activeRlayer)

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
      $selected = [[$rmap.map.groups.length - 1, -1]]
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
    $rmap.editTile(e)
  }
  function serverOnEditTiles(e: EditTiles) {
    const tiles = dataToTiles(e.data, e.kind as MapDir.LayerKind)

    for (let i = 0; i < tiles.length; ++i) {
      const tile = tiles[i]
      const x = i % e.width
      const y = Math.floor(i / e.width)

      $rmap.editTile({
        group: e.group,
        layer: e.layer,
        x: x + e.x,
        y: y + e.y,
        ...tile
      })
    }
  }
  function serverOnCreateQuad(e: CreateQuad) {
    $rmap.createQuad(e)
    activeLayer = activeLayer // hack to redraw quadview
  }
  function serverOnEditQuad(e: EditQuad) {
    $rmap.editQuad(e)
    activeLayer = activeLayer // hack to redraw quadview
  }
  function serverOnDeleteQuad(e: DeleteQuad) {
    $rmap.deleteQuad(e)
    activeLayer = activeLayer // hack to redraw quadview
  }
  function serverOnCreateEnvelope(e: CreateEnvelope) {
    $rmap.createEnvelope(e)
    $rmap = $rmap // hack to redraw env editor
  }
  function serverOnEditEnvelope(e: EditEnvelope) {
    $rmap.editEnvelope(e)
    $rmap = $rmap // hack to redraw env editor
  }
  function serverOnDeleteEnvelope(e: DeleteEnvelope) {
    $rmap.removeEnvelope(e.index)
    $rmap = $rmap // hack to redraw env editor
  }
  function serverOnEditGroup(e: EditGroup) {
    $rmap.editGroup(e)
    $rmap = $rmap // hack to redraw treeview
  }
  async function serverOnEditLayer(e: EditLayer) {
    $rmap.editLayer(e)
    $rmap = $rmap // hack to redraw treeview
  }
  function serverOnCreateGroup(e: CreateGroup) {
    $rmap.createGroup(e)
    $rmap = $rmap // hack to redraw treeview
  }
  function serverOnCreateLayer(e: CreateLayer) {
    $rmap.createLayer(e)
    $rmap = $rmap // hack to redraw treeview
  }
  function serverOnDeleteGroup(e: DeleteGroup) {
    $rmap.deleteGroup(e)
    $rmap = $rmap // hack to redraw treeview
    $selected = $selected.filter(([g, _]) => g !== e.group)
    if ($selected.length === 0)
      $selected = [[Math.min($rmap.map.groups.length - 1, e.group), -1]]
  }
  function serverOnDeleteLayer(e: DeleteLayer) {
    $rmap.deleteLayer(e)
    $rmap = $rmap // hack to redraw treeview
    $selected = $selected.filter(([g, l]) => g !== e.group || l !== e.layer)
    if ($selected.length === 0) {
      $selected = (activeGroup.layers.length === 0) ?
        [$rmap.map.physicsLayerIndex(GameLayer)] :
        [[g, Math.min(activeGroup.layers.length - 1, e.layer)]]
    }
  }
  function serverOnReorderGroup(e: ReorderGroup) {
    $rmap.reorderGroup(e)
    $rmap = $rmap // hack to redraw treeview
    $selected.pop() // remove active
    const active: [number, number] =
       activeLayer ? $rmap.map.layerIndex(activeLayer) :
       activeGroup ? [$rmap.map.groupIndex(activeGroup), -1] :
       $rmap.map.physicsLayerIndex(GameLayer)
      
    $selected = [...$selected, active]
  }
  function serverOnReorderLayer(e: ReorderLayer) {
    $rmap.reorderLayer(e)
    $rmap = $rmap // hack to redraw treeview
    $selected.pop() // remove active
    const active: [number, number] =
       activeLayer ? $rmap.map.layerIndex(activeLayer) :
       activeGroup ? [$rmap.map.groupIndex(activeGroup), -1] :
       $rmap.map.physicsLayerIndex(GameLayer)
    $selected = [...$selected, active]
  }
  async function serverOnCreateImage(e: CreateImage) {
    if (e.index !== $rmap.map.images.length)
      return
    if (e.external) {
      const image = new Image()
      image.loadExternal(externalImageUrl(e.name))
      image.name = e.name
      $rmap.addImage(image)
    } else {
      const image = new Image()
      image.name = e.name
      $rmap.addImage(image)
      const data = await queryImageData($serverConfig.httpUrl, $rmap.map.name, e.index)
      image.loadEmbedded(data)
    }
    $rmap = $rmap // hack to redraw treeview
  }
  function serverOnDeleteImage(e: DeleteImage) {
    $rmap.removeImage(e.index)
  }
  async function serverOnEditMap(e: EditMap) {
    $rmap.map.info = e.info
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

  async function onServerClosed() {
    await showError('You have been disconnected from the server.')
    navigate('/')
  }

  onMount(() => {
    $selected = [$rmap.map.physicsLayerIndex(GameLayer)]
    $server.socket.addEventListener('close', onServerClosed, { once: true })
    $server.on('listusers', serverOnUsers)
    $server.on('edittile', serverOnEditTile)
    $server.on('edittiles', serverOnEditTiles)
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

    canvas.addEventListener('mouseenter', onHoverCanvas)
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

    canvas.removeEventListener('mouseenter', onHoverCanvas)
  })

  function onHoverCanvas() {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    canvas.focus()
  }

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
  }

  async function onSaveMap() {
    try {
      showInfo('Saving map...', 'none')
      await $server.query('savemap', { name: $rmap.map.name })
      showInfo('Map saved on the server.', 'closable')
    } catch (e) {
      showError('Failed to save map: ' + e)
    }
  }

  function onDownloadMap() {
    downloadMap($serverConfig.httpUrl, $rmap.map.name)
  }

  function onRenameMap() {
    alert('TODO renaming maps is not yet implemented.')
  }

  async function onLeaveMap() {
    await $server.query('leavemap', null)
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
        await $server.query('deletemap', { name: $rmap.map.name })
        navigate('/')
      } catch (e) {
        showError('Map deletion failed: ' + e)
      }
  }

  function onKeyDown(e: KeyboardEvent) {
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
    const target = e.target as HTMLElement
    if (!target.contains(canvas)) return

    Editor.fire('keyup', e)
  }

  function onKeyPress(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    if (!target.contains(canvas)) return

    Editor.fire('keypress', e)
  }


  function onEditInfo() {
    infoEditorVisible = !infoEditorVisible
  }

  async function onInfoClose() {
    infoEditorVisible = false
    try {
      // showInfo('Please wait…')
      const change: EditMap = {
        info: $rmap.map.info,
      }
      const res = await $server.query('editmap', change)
      $rmap.map.info = res.info
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
      <span id="map-name">{$rmap.map.name}</span>
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
          <TreeView />
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
          <Viewport {animEnabled} />
        </Pane>

        <Pane class="properties" bind:size={propsPaneSize}>
          {#if $selected.length > 1}
            <div class="edit-multiple">
              <h3 class="bx--modal-header__heading">Multiple selection</h3>
              {#if ll.length > 1}
                <span>You $selected {ll.length} tile layers.</span>
                <span>You can edit the tiles from these layers together with your brush (clone, delete and repeat).</span>
              {:else}
                <span>You $selected multiple layers.</span>
                <span>Editing quad layers together is not implemented yet. You can only edit tiles layers together.</span>
              {/if}
            </div>
          {:else if l !== -1}
            <LayerEditor
              on:deletelayer={e => onDeleteLayer(e.detail)}
              on:editlayer={e => onEditLayer(e.detail)}
              on:reorderlayer={e => onReorderLayer(e.detail)}
            />
          {:else if g !== -1}
            <GroupEditor
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
      <EnvelopeEditor />
    </Pane>
  </Splitpanes>

  <ComposedModal
    open={infoEditorVisible}
    on:close={onInfoClose}
    selectorPrimaryFocus=".bx--modal-close"
  >
    <ModalHeader title="Map Properties" />
    <ModalBody hasForm>
      <InfoEditor info={$rmap.map.info} />
    </ModalBody>
  </ComposedModal>

</div>
