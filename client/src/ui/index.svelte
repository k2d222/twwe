<script lang="ts">
  import { Router, Route } from 'svelte-routing'
  import Lobby from './routes/lobby.svelte'
  import Edit from './routes/edit.svelte'
  import CreateMap from './routes/create.svelte'

  export let url = ''

  import 'carbon-components/scss/components/modal/_modal.scss'
  import 'carbon-components/scss/components/tabs/_tabs.scss'
  import 'carbon-components/scss/components/file-uploader/_file-uploader.scss'
</script>

<Router {url}>
  <div>
    <Route path="edit/*mapName" let:params><Edit mapName={params.mapName} /></Route>
    <Route path="/"><Lobby /></Route>
    <Route path="create/"><CreateMap /></Route>
  </div>
</Router>
