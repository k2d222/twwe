<script context="module" lang="ts">
	import { pServer } from './stores'
  import { writable } from 'svelte/store';

  let peerCount = writable(0)

  pServer
  .then((server) => {
    server.on('users', (e) => { peerCount.set(e.count) })
  })
</script>

<script lang="ts">
  import { Map } from '../twmap/map'
  import { renderer, init as glInit } from '../gl/global'
  import { RenderMap } from '../gl/renderMap'
	import { server } from './stores'
  import Dialog from './dialog.svelte'
  import TreeView from './treeView.svelte'

  export let mapName

  let canvas
  let map
  let rmap
  let treeViewVisible = true
  let selectedLayer

  function createRenderMap(canvas, map) {
    glInit(canvas)
    rmap = new RenderMap(map)

    function loop() {
      renderer.render(rmap)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
    return rmap
  }

  async function loadMap() {
    const joined = server.query('join', mapName)
    if (!joined)
      throw "failed to join room"
    const buf = await server.query('map')
    map = new Map(mapName, buf)
    return map
  }

  const pLoadMap = loadMap()

  $: if(canvas && map) { rmap = createRenderMap(canvas, map) }

  function toggleTreeView() {
    treeViewVisible = !treeViewVisible
  }

  async function saveMap() {
    server.send('save')
  }

  async function downloadMap() {
    const buf = await server.query('map')
    const blob = new Blob([buf], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a');
    link.href = url;
    link.download = map.name + '.map';

    document.body.append(link);
    link.click();
    link.remove();
  }
  const pSave = null

  function getLayerImage(groupID, layerID) {
    const layer = map.groups[groupID].layers[layerID]
    let image = layer.image
    if (layer.type === LayerType.GAME)
      image = rmap.gameLayer.texture.image
    tileSelector.setImage(image)
  }

</script>

{#await pLoadMap}
  <Dialog>Loading "{mapName}"…</Dialog>
{:then map}
  <div id="editor">
    <canvas bind:this={canvas}></canvas>
    {#if rmap}
  		<div id="menu">
  			<div class="left">
  				<button id="nav-toggle" on:click={toggleTreeView}><img src="../../assets/tree.svg" alt="" title="Show layers"></button>
  				<button id="save" on:click={saveMap}><img src="../../assets/save.svg" alt="" title="Save the map on the server">Save</button>
  				<button id="download" on:click={downloadMap}><img src="../../assets/download.svg" alt="" title="Download this map to your computer">Download</button>
  			</div>
  			<div class="middle">
  				<span id="map-name"></span>
  			</div>
  			<div class="right">
  				<div id="users">Users online: <span>{$peerCount}</span></div>
  			</div>
  		</div>
      <TreeView visible={treeViewVisible} {rmap} bind:selected={selectedLayer} />
    {/if}
  </div>
{:catch e}
  {console.error(e)}
  <Dialog>Failed to join the map "{mapName}".</Dialog>
{/await}
