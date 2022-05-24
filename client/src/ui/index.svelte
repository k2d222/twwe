<script lang='ts'>
  const { VITE_BACKEND_HOST, VITE_BACKEND_PORT } = import.meta.env
  import { Router, Route } from 'svelte-routing'
  import Lobby from './routes/lobby.svelte'
  import Edit from './routes/edit.svelte'
  import Dialog from './lib/dialog.svelte'
  import { pServer } from './global'

  export let url = ""
</script>

{#await pServer}
  <Dialog>Connecting to server…</Dialog>
{:then}
  <Router url="{url}">
    <div>
      <Route path="edit/:mapName" let:params><Edit mapName={params.mapName}/></Route>
      <Route path="/"><Lobby /></Route>
    </div>
  </Router>
{:catch e}
  {console.error(e)}
  <Dialog>Failed to connect to the server {VITE_BACKEND_HOST}:{VITE_BACKEND_PORT}.</Dialog>
{/await}
