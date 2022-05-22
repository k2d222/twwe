<script lang="ts">
  import { Map } from '../twmap/map'
  import { renderer, init as glInit } from '../gl/global'
  import { RenderMap } from '../gl/renderMap'
  import Dialog from './dialog.svelte'
  import TreeView from './treeView.svelte'

  export let server
  export let mapName

  let canvas
  let map
  let rmap
  let treeViewVisible

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

  $: if(canvas && map) { rmap = createRenderMap(canvas, map) }

  function toggleTreeView() {
    treeViewVisible = !treeViewVisible
  }

</script>

{#await loadMap()}
  <Dialog>Loading "{mapName}"…</Dialog>
{:then map}
  <div id="editor">
    <canvas bind:this={canvas}></canvas>
    {#if rmap}
  		<div id="menu">
  			<div class="left">
  				<button id="nav-toggle" on:click={toggleTreeView}><img src="/tree.svg" alt="" title="Show layers"></button>
  				<button id="save"><img src="/save.svg" alt="" title="Save the map on the server">Save</button>
  				<button id="download"><img src="/download.svg" alt="" title="Download this map to your computer">Download</button>
  			</div>
  			<div class="middle">
  				<span id="map-name"></span>
  			</div>
  			<div class="right">
  				<div id="users">Users online: <span>0</span></div>
  			</div>
  		</div>
      <TreeView visible={treeViewVisible} {rmap}/>
    {/if}
  </div>
{:catch e}
  {console.error(e)}
  <Dialog>Failed to join the map "{mapName}".</Dialog>
{/await}
