<script lang='ts'>
  import { Router, Link, Route } from "svelte-routing"
  import Lobby from "./lobby.svelte"
  import Editor from "./editor.svelte"
  import Dialog from "./dialog.svelte"
  import { Server } from "../server/server"

  export let url = ""

  let server

</script>

{#await Server.create(process.env.BACKEND_HOST, parseInt(process.env.BACKEND_PORT, 10))}
  <Dialog>Connecting to server…</Dialog>
{:then server}
  <Router url="{url}">
    <div>
      <Route path="edit/:mapName" let:params><Editor {server} {...params}/></Route>
      <Route path="/"><Lobby {server}/></Route>
    </div>
  </Router>
{:catch e}
  <Dialog>Failed to connect to the server {process.env.BACKEND_HOST}:{process.env.BACKEND_PORT}.</Dialog>
{/await}
