<script type="ts">
  import type { CreateMap } from '../../server/protocol'
  import { server } from '../global'
  import { showInfo, showError, clearDialog } from '../lib/dialog'
  import { navigate } from 'svelte-routing'

  let name = ''

  let width = 100
  let height = 100
  let defaultLayers = true

  let clone = ''
  
  let mapUploaded = false

  let creationMethod: 'blank' | 'clone' | 'upload' = 'blank'

  let mapInfos = []
  $: server.query('maps').then(infos => {
    infos.sort((a, b) => a.name.localeCompare(b.name))
    mapInfos = infos
  })

  function onFileChange(e: Event) {
    mapUploaded = false

    const file = (e.target as HTMLInputElement).files[0]
    const reader = new FileReader()

    const onRefused = (reason: string) => {
      server.off('refused', onRefused)
      server.off('uploadcomplete', onUpload)
      showError('Failed to upload map: ' + reason)
    }

    const onUpload = () => {
      server.off('refused', onRefused)
      server.off('uploadcomplete', onUpload)
      showInfo('Map upload complete.')
      mapUploaded = true
    }

    reader.onload = async () => {
      const data = reader.result as ArrayBuffer
      server.on('refused', onRefused)
      server.on('uploadcomplete', onUpload)
      await server.sendBinaryBlocking(data, (progress) => {
        showInfo("Uploading map " + Math.round(progress / data.byteLength * 100) + "% …", false)
      })
    }
    reader.onerror = () => {
      showError("Failed to load the file from your computer.")
    }
    reader.onprogress = (e) => {
      showInfo("Loading map " + Math.round(e.loaded / e.total * 100) + "% …", false)
    }

    reader.readAsArrayBuffer(file)
  }

  async function onCreateMap() {
    if (name === '') {
      showError('Please enter a map name first.')
      return
    }

    let create: CreateMap
    if (creationMethod === 'blank') {
      create = {
        name, blank: { width, height, defaultLayers }
      }
    }
    else if (creationMethod === 'clone') {
      if (clone === '') {
        showError('Please select the map to clone first.')
        return
      }
      create = {
        name, clone: { clone }
      }
    }
    else if (creationMethod === 'upload') {
      if (!mapUploaded) {
        showError('Please upload a map first.')
        return
      }
      create = {
        name, upload: {}
      }
    }
    
    showInfo('Querying the server…', false)
    const onRefused = (err: string) => {
      showError('Map creation refused: ' + err)
    }
    // COMBAK: this is ugly, need to refactor server error handling globally
    server.on('refused', onRefused)
    const success = await server.query('createmap', create)
    server.off('refused', onRefused)
    if (success) {
      clearDialog()
      navigate('/edit/' + name)
    } else {
      showError('Map creation failed.')
    }
  }

</script>
  
<div id="lobby">
  <div class="content">
    <h2>Create new map</h2>
    <div class="buttons">
      <input type="text" placeholder="Enter map name…" bind:value={name} />
      <button class="join" on:click={onCreateMap}>Create</button>
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
        <label for="width">Width:</label>
        <input id="width" type="number" min={0} bind:value={width} />
        <label for="height">Height:</label>
        <input id="height" type="number" min={0} bind:value={height} />
        <label for="createDefault">Create default layers:</label>
        <input id="createDefault" type="checkbox" bind:checked={defaultLayers} />
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
