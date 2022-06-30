<script lang="ts">
  import type { Map } from '../../twmap/map'
  import type { ListUsers, EditTile, EditGroup, EditLayer, CreateLayer, CreateGroup, DeleteLayer, DeleteGroup, ReorderLayer, ReorderGroup } from '../../server/protocol'
  import { onMount, onDestroy } from 'svelte'
  import { server } from '../global'
  import TreeView from './treeView.svelte'
  import TileSelector from './tileSelector.svelte'
  import { showInfo, showError, clearDialog } from './dialog'
  import Statusbar from './statusbar.svelte'
  import * as Editor from './editor'

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
  function serverOnEditLayer(e: EditLayer) {
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

  onMount(() => {
    cont.append(canvas)
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
    server.send('listusers')
    canvas.focus()
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
    showInfo('Saving map…', 'none')
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


  function onClick(e: MouseEvent) {
    // left button pressed
    if (e.buttons === 1 && !e.ctrlKey) {
      Editor.placeTile(rmap, ...selectedLayer, selectedID)
    }
  }

  function onEditLayer(e: Event & { detail: EditLayer }) {
    server.send('editlayer', e.detail)
  }
  function onEditGroup(e: Event & { detail: EditGroup }) {
    server.send('editgroup', e.detail)
  }
  function onCreateGroup(e: Event & { detail: CreateGroup }) {
    server.send('creategroup', e.detail)
  }
  function onCreateLayer(e: Event & { detail: CreateLayer }) {
    server.send('createlayer', e.detail)
  }
  async function onReorderGroup(e: Event & { detail: ReorderGroup }) {
    try {
      showInfo('Please wait…')
      await server.query('reordergroup', e.detail)
      rmap.reorderGroup(e.detail)
      rmap = rmap // hack to redraw treeview
      clearDialog()
    } catch (e) {
      showError('Failed to reorder group: ' + e)
    }
  }
  async function onReorderLayer(e: Event & { detail: ReorderLayer }) {
    try {
      showInfo('Please wait…')
      await server.query('reorderlayer', e.detail)
      rmap.reorderLayer(e.detail)
      rmap = rmap // hack to redraw treeview
      clearDialog()
    } catch (e) {
      showError('Failed to reorder group: ' + e)
    }
  }
  async function onDeleteGroup(e: Event & { detail: DeleteGroup }) {
    try {
      showInfo('Please wait…')
      await server.query('deletegroup', e.detail)
      rmap.deleteGroup(e.detail)
      rmap = rmap // hack to redraw treeview
      clearDialog()
    } catch (e) {
      showError('Failed to reorder group: ' + e)
    }
  }
  async function onDeleteLayer(e: Event & { detail: DeleteLayer }) {
    try {
      showInfo('Please wait…')
      await server.query('deletelayer', e.detail)
      rmap.deleteLayer(e.detail)
      rmap = rmap // hack to redraw treeview
      clearDialog()
    } catch (e) {
      showError('Failed to reorder group: ' + e)
    }
  }

</script>

<div id="editor">
  <div bind:this={cont} on:mousemove={onClick}></div>
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
  <TreeView visible={treeViewVisible} {rmap} bind:selected={selectedLayer}
    on:layerchange={onEditLayer} on:groupchange={onEditGroup}
    on:createlayer={onCreateLayer} on:creategroup={onCreateGroup}
    on:editlayer={onEditLayer} on:editgroup={onEditGroup}
    on:deletelayer={onDeleteLayer} on:deletegroup={onDeleteGroup}
    on:reorderlayer={onReorderLayer} on:reordergroup={onReorderGroup}
  />
  <TileSelector image={tileSelectorImg} bind:selected={selectedID} />
</div>
