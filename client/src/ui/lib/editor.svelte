<script context="module" lang="ts">
	import { pServer } from '../global'
  import { writable } from 'svelte/store'
  import type { RenderMap } from '../../gl/renderMap'

  let peerCount = writable(0)
  let rmap: RenderMap

  pServer
  .then((server) => {
    server.on('users', (e) => { peerCount.set(e.count) })
    server.on('tilechange', (e) => { rmap.applyTileChange(e) })
    server.on('layerchange', (e) => { rmap.applyLayerChange(e) })
    server.on('groupchange', (e) => { rmap.applyGroupChange(e) })
  })
</script>

<script lang="ts">
  import { onMount } from 'svelte'
  import { server } from '../global'
  import type { Map } from '../../twmap/map'
  import TreeView from './treeView.svelte'
  import TileSelector from './tileSelector.svelte'
  import * as Editor from './editor'

  export let map: Map

  let cont: HTMLElement
  let canvas = document.createElement('canvas')
  rmap = Editor.createRenderMap(canvas, map)
  let treeViewVisible = true
  let selectedLayer = map.gameLayerID()
  let selectedID = 0
  
  $: tileSelectorImg = Editor.getLayerImage(rmap, ...selectedLayer)

  onMount(() => {
    cont.append(canvas)
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
    rmap.applyLayerChange(e.detail)
    server.send('layerchange', e.detail)
  }

  function onGroupChange(e: Event & { detail: GroupChange }) {
    rmap.applyGroupChange(e.detail)
    server.send('groupchange', e.detail)
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
			<div id="users">Users online: <span>{$peerCount}</span></div>
		</div>
	</div>
  <TreeView visible={treeViewVisible} {rmap} bind:selected={selectedLayer} on:layerchange={onLayerChange} on:groupchange={onGroupChange} />
  <TileSelector image={tileSelectorImg} bind:selected={selectedID} />
</div>
