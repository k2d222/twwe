<script lang="ts">
  import type { Map } from '../../twmap/map'
  import type { UsersData, TileChange, GroupChange, LayerChange, CreateLayer } from '../../server/protocol'
  import { onMount, onDestroy } from 'svelte'
  import { server } from '../global'
  import TreeView from './treeView.svelte'
  import TileSelector from './tileSelector.svelte'
  import { showInfo, showError, clearDialog } from './dialog'
  import * as Editor from './editor'

  export let map: Map

  let cont: HTMLElement
  let canvas = document.createElement('canvas')
  let rmap = Editor.createRenderMap(canvas, map)
  let treeViewVisible = true
  let selectedLayer = map.gameLayerID()
  let selectedID = 0
  let peerCount = 0
  
  $: tileSelectorImg = Editor.getLayerImage(rmap, ...selectedLayer)
  
  function serverOnUsers(e: UsersData) {
    peerCount = e.count
  }

  function serverOnTileChange(e: TileChange) {
    rmap.applyTileChange(e)
  }

  function serverOnLayerChange(e: LayerChange) {
    rmap.applyLayerChange(e)
    rmap = rmap // hack to redraw treeview
  }

  function serverOnGroupChange(e: GroupChange) {
    rmap.applyGroupChange(e)
    rmap = rmap // hack to redraw treeview 
  }

  function serverOnCreateGroup() {
    rmap.createGroup()
    rmap = rmap // hack to redraw treeview
  }

  function serverOnCreateLayer(e: CreateLayer) {
    rmap.createLayer(e)
    rmap = rmap // hack to redraw treeview 
  }

  onMount(() => {
    cont.append(canvas)
    server.on('users', serverOnUsers)
    server.on('tilechange', serverOnTileChange)
    server.on('layerchange', serverOnLayerChange)
    server.on('groupchange', serverOnGroupChange)
    server.on('creategroup', serverOnCreateGroup)
    server.on('createlayer', serverOnCreateLayer)
    server.send('users')
  })
  
  onDestroy(() => {
    server.off('users', serverOnUsers)
    server.off('tilechange', serverOnTileChange)
    server.off('layerchange', serverOnLayerChange)
    server.off('groupchange', serverOnGroupChange)
    server.off('creategroup', serverOnCreateGroup)
    server.off('createlayer', serverOnCreateLayer)
  })

  function onToggleTreeView() {
    treeViewVisible = !treeViewVisible
  }

  async function onSaveMap() {
    server.send('save')
  }

  function onDownloadMap() {
    Editor.downloadMap(map.name)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (['Tab', 'Escape'].includes(e.key))
      e.preventDefault()
    if (e.key === ' ')
      Editor.placeTile(rmap, ...selectedLayer, selectedID)
    else if (e.key === 'Tab')
      onToggleTreeView()
  }

  function onLayerChange(e: Event & { detail: LayerChange }) {
    const onRefused = (e: string) => {
      showError('Server refused that operation: ' + e)
      server.off('refused', onRefused)
      server.off('layerchange', onLayerChange)
    }
    
    // BUG: desync if the received layerchange comes from another client
    const onLayerChange = () => {
      clearDialog()
      server.off('refused', onRefused)
      server.off('layerchange', onLayerChange)
    }

    showInfo('Asking permission to server…', false)
    server.on('refused', onRefused)
    server.on('layerchange', onLayerChange)
    server.send('layerchange', e.detail)
  }

  function onGroupChange(e: Event & { detail: GroupChange }) {
    const onRefused = (e: string) => {
      showError('Server refused that operation: ' + e)
      server.off('refused', onRefused)
      server.off('groupchange', onGroupChange)
    }

    // BUG: desync if the received groupchange comes from another client
    const onGroupChange = () => {
      clearDialog()
      server.off('refused', onRefused)
      server.off('groupchange', onGroupChange)
    }

    showInfo('Asking permission to server…', false)
    server.on('refused', onRefused)
    server.on('groupchange', onGroupChange)
    server.send('groupchange', e.detail)
  }
  
  function onCreateGroup() {
    server.send('creategroup')
  }
  
  function onCreateLayer(e: Event & { detail: CreateLayer }) {
    server.send('createlayer', e.detail)
  }

</script>

<svelte:window on:keydown={onKeyDown} />

<div id="editor">
  <div bind:this={cont}></div>
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
  <TreeView visible={treeViewVisible} {rmap} bind:selected={selectedLayer}
    on:layerchange={onLayerChange} on:groupchange={onGroupChange} on:createlayer={onCreateLayer} on:creategroup={onCreateGroup} />
  <TileSelector image={tileSelectorImg} bind:selected={selectedID} />
</div>
