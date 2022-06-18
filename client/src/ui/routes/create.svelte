<script type="ts">
  let mapName = ''

  let mapWidth = 100
  let mapHeight = 100
  let createDefaultLayers = true

  let cloneName = ''
  let creationMethod = 'blank'

	function onFileChange(e: ChangeEvent) {
		console.log(e)
	}

</script>
  
<div id="lobby">
	<div class="content">
    <h2>Create new map</h2>
    <div class="buttons">
    	<input type="text" placeholder="Enter map name…" value={mapName} />
    	<button class="join">Create</button>
    </div>
    <h2>Settings</h2>
    <div class="settings">
      <span>Method:</span>
      <span>
        <label><input type="radio" name="creationMethod" bind:group={creationMethod} value="blank" />Create blank</label>
        <label><input type="radio" name="creationMethod" bind:group={creationMethod} value="upload" />Upload from computer</label>
        <label><input type="radio" name="creationMethod" bind:group={creationMethod} value="clone" />Clone existing map</label>
      </span>
      {#if creationMethod === 'blank'}
        <label for="width">width:</label>
        <input id="width" type="number" min={0} bind:value={mapWidth} />
        <label for="height">height:</label>
        <input id="height" type="number" min={0} bind:value={mapHeight} />
        <label for="createDefault">Create default layers:</label>
        <input id="createDefault" type="checkbox" bind:checked={createDefaultLayers} />
      {:else if creationMethod === 'upload'}
        <span>Upload file</span>
      	<span><input type="file" placeholder="upload map file…" on:change={onFileChange} /></span>
      {:else if creationMethod === 'clone'}
        <span>Cloned map</span>
        <span><input type="text" placeholder="Select map to clone…" value={cloneName} /></span>
      {/if}
    </div>
  </div>
</div>
