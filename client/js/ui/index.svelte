<script lang='ts'>
  import { Router, Link, Route } from "svelte-routing"
  import Lobby from "./lobby.svelte"
  import Editor from "./editor.svelte"
  import Dialog from "./dialog.svelte"
  import { Server } from "../server/server"

  export let url = ""

  let server
  
  const { VITE_BACKEND_HOST, VITE_BACKEND_PORT } = import.meta.env
  console.log(import.meta.env)

</script>

{#await Server.create(VITE_BACKEND_HOST, parseInt(VITE_BACKEND_PORT, 10))}
  <Dialog>Connecting to server…</Dialog>
{:then server}
  <Router url="{url}">
    <div>
      <Route path="edit/:mapName" let:params><Editor {server} {...params}/></Route>
      <Route path="/"><Lobby {server}/></Route>
    </div>
  </Router>
{:catch e}
  <Dialog>Failed to connect to the server {VITE_BACKEND_HOST}:{VITE_BACKEND_PORT}.</Dialog>
{/await}
