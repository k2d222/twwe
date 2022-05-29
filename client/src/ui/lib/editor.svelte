<script context="module" lang="ts">
	import { pServer } from '../global'
  import { writable } from 'svelte/store'
  import type { RenderMap } from '../../gl/renderMap'

  let peerCount = writable(0)
  let rmap: RenderMap

  pServer
  .then((server) => {
    server.on('users', (e) => { peerCount.set(e.count) })
    server.on('change', (e) => { rmap.applyTileChange(e) })
  })
</script>

<script lang="ts">
  import { onMount } from 'svelte'
  import { server } from '../global'
  import type { Map } from '../../twmap/map'
  import TreeView from './treeView.svelte'
  import TileSelector from './tileSelector.svelte'
  import Statusbar from './statusbar.svelte'
  import * as Editor from './editor'

  export let map: Map

  let cont: HTMLElement

  let canvas = document.createElement('canvas')
  canvas.tabIndex = 1 // make canvas focusable to catch keyboard events 
  canvas.addEventListener('keydown', onKeyDown)

  rmap = Editor.createRenderMap(canvas, map)

  let treeViewVisible = true
  let selectedLayer = map.gameLayerID()
  let selectedID = 0
  
  let tileSelectorVisible = false
  $: tileSelectorImg = Editor.getLayerImage(rmap, ...selectedLayer)

  onMount(() => {
    cont.append(canvas)
    canvas.focus()
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
			<div id="users">Users online: <span>{$peerCount}</span></div>
		</div>
	</div>
  <Statusbar />
  <TreeView visible={treeViewVisible} {rmap} bind:selected={selectedLayer} />
  <TileSelector image={tileSelectorImg} bind:selected={selectedID} bind:visible={tileSelectorVisible} />
</div>
