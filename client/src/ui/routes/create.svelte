<script type="ts">
  import type { CreateMap, MapAccess } from '../../server/protocol'
  import { server } from '../global'
  import { showInfo, showWarning, showError, clearDialog } from '../lib/dialog'
  import { navigate } from 'svelte-routing'

  let name = ''
  let access: MapAccess = 'public'

  let width = 100
  let height = 100

  let clone = ''
  
  let mapUploaded = false

  let creationMethod: 'blank' | 'clone' | 'upload' = 'blank'

  let mapInfos = []
  $: server.query('listmaps', null).then(listMaps => {
    listMaps.maps.sort((a, b) => a.name.localeCompare(b.name))
    mapInfos = listMaps.maps
  })

  async function onFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files[0]
    mapUploaded = false
    
    try {
      showInfo('Uploading map...', 'none')
      await server.uploadFile(await file.arrayBuffer())
      mapUploaded = true
      showInfo('Map upload complete. Enter a name and hit "Create".')
    }
    catch (e) {
      showError('Failed to upload map: ' + e)
    }
  }

  async function onCreateMap() {
    if (name === '') {
      showError('Please enter a map name first.')
      return
    }
    
    let create: CreateMap
    if (creationMethod === 'blank') {
      create = {
        name, access, blank: { width, height, defaultLayers: false }
      }
    }
    else if (creationMethod === 'clone') {
      if (clone === '') {
        showError('Please select the map to clone first.')
        return
      }
      create = {
        name, access, clone: { clone }
      }
    }
    else if (creationMethod === 'upload') {
      if (!mapUploaded) {
        showError('Please upload a map first.')
        return
      }
      create = {
        name, access, upload: {}
      }
    }
    
    showInfo('Querying the server…', 'none')
    try {
      await server.query('createmap', create)
      clearDialog()
      if (access === 'unlisted') {
        const url = window.location.origin + '/edit/' + encodeURIComponent(create.name)
        showWarning('You created a private map that won\'t be publicly listed. To access it in the future, use this URL: ' + url)
      }

      navigate('/edit/' + name)
    }
    catch (e) {
      showError('Map creation failed: ' + e)
    }
  }

</script>
  
<div id="lobby">
  <div class="content">
    <h2>Create new map</h2>
    <div class="buttons">
      <input type="text" placeholder="Enter map name…" bind:value={name} />
      <button class="primary join" on:click={onCreateMap}>Create</button>
    </div>
    {#if access === 'unlisted' && name}
      <code>{window.location.origin}/edit/{encodeURIComponent(name)}</code>
    {/if}
    <h2>Settings</h2>
    <div class="settings">
      <span>Method:</span>
      <span>
        <label><input type="radio" name="creationMethod" bind:group={creationMethod} value="blank" />Create blank</label>
        <label><input type="radio" name="creationMethod" bind:group={creationMethod} value="upload" />Upload from computer</label>
        <label><input type="radio" name="creationMethod" bind:group={creationMethod} value="clone" />Clone existing map</label>
      </span>
      <label for="access">Access level:</label>
      <select bind:value={access} id="access">
        <option value="public">Public - Everyone can edit the map.</option>
        <option value="unlisted">Unlisted - People need the link to edit the map.</option>
      </select>
      {#if creationMethod === 'blank'}
        <label for="width">Width:</label>
        <input id="width" type="number" min={0} bind:value={width} />
        <label for="height">Height:</label>
        <input id="height" type="number" min={0} bind:value={height} />
      {:else if creationMethod === 'upload'}
        <span>Upload file</span>
        <span><input type="file" placeholder="upload map file…" accept=".map" on:change={onFileChange} /></span>
      {:else if creationMethod === 'clone'}
        <span>Cloned map</span>
        <select bind:value={clone} placeholder='Select a map to clone…'>
          {#each mapInfos as info}
            <option value={info.name}>{info.name}</option>
          {/each}
        </select>
      {/if}
    </div>
  </div>
</div>
