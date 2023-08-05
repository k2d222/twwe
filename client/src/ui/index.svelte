<script lang="ts">
  import { Router, Route } from 'svelte-routing'
  import Lobby from './routes/lobby.svelte'
  import Edit from './routes/edit.svelte'
  import JoinServer from './lib/joinServer.svelte'

  export let url = ''
</script>

<Router {url}>
  <div>
    <Route path="edit/*mapName" let:params>
      <JoinServer><Edit name={params.mapName} /></JoinServer>
    </Route>
    <Route path="/">
      <Lobby />
    </Route>
  </div>
</Router>
