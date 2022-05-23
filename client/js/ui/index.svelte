<script lang='ts'>
  const { VITE_BACKEND_HOST, VITE_BACKEND_PORT } = import.meta.env
  import { Router, Link, Route } from "svelte-routing"
  import Lobby from "./lobby.svelte"
  import Editor from "./editor.svelte"
  import Dialog from "./dialog.svelte"
  import { pServer } from "./stores"

  export let url = ""
</script>

{#await pServer}
  <Dialog>Connecting to server…</Dialog>
{:then server}
  <Router url="{url}">
    <div>
      <Route path="edit/:mapName" let:params><Editor {...params}/></Route>
      <Route path="/"><Lobby /></Route>
    </div>
  </Router>
{:catch e}
  <Dialog>Failed to connect to the server {VITE_BACKEND_HOST}:{VITE_BACKEND_PORT}.</Dialog>
{/await}
