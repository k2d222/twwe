<script lang='ts'>
  const { VITE_WEBSOCKET_URL } = import.meta.env
  import { Router, Route } from 'svelte-routing'
  import Lobby from './routes/lobby.svelte'
  import Edit from './routes/edit.svelte'
  import CreateMap from './routes/create.svelte'
  import Dialog from './lib/dialog.svelte'
  import { pServer } from './global'

  export let url = ""

  import 'carbon-components/scss/components/modal/_modal.scss'
  import 'carbon-components/scss/components/tabs/_tabs.scss'
  import 'carbon-components/scss/components/file-uploader/_file-uploader.scss'
</script>

{#await pServer}
  <Dialog>Connecting to server…</Dialog>
{:then}
  <Router url="{url}">
    <div>
      <Route path="edit/*mapName" let:params><Edit mapName={params.mapName}/></Route>
      <Route path="/"><Lobby /></Route>
      <Route path="create/"><CreateMap /></Route>
    </div>
  </Router>
{:catch e}
  {console.error(e)}
  <Dialog type="error">Failed to connect to the server {VITE_WEBSOCKET_URL}.</Dialog>
{/await}
