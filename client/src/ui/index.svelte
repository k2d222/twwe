<script lang="ts">
  import { Router, Route } from 'svelte-routing'
  import Lobby from './routes/lobby.svelte'
  import Edit from './routes/edit.svelte'
  import CreateMap from './routes/create.svelte'

  export let url = ''
</script>

<Router {url}>
  <div>
    <Route path="edit/*mapName" let:params><Edit mapName={params.mapName} /></Route>
    <Route path="/"><Lobby /></Route>
    <Route path="create/"><CreateMap /></Route>
  </div>
</Router>
