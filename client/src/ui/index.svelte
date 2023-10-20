<script lang="ts">
  import { Router, Route } from 'svelte-routing'
  import Lobby from './routes/lobby.svelte'
  import Edit from './routes/edit.svelte'
  import Fence from './lib/fence.svelte'
  import storage from '../storage'
  import { WebSocketServer } from '../server/server'
  import { server, serverCfg } from './global'
  import { serverWsUrl } from '../server/util'

  export let url = ''

  function joinServer() {
    const serverCfgs = storage.load('servers')
    const serverId = storage.load('currentServer')

    $serverCfg = serverCfgs[serverId]
    const wsUrl = serverWsUrl($serverCfg)
    $server = new WebSocketServer(wsUrl)

    return new Promise((resolve, reject) => {
      $server.socket.addEventListener('open', resolve, { once: true })
      $server.socket.addEventListener('error', () => reject("Failed to connect to the server"), { once: true })
    })
  }
</script>

<Router {url}>
  <Route path="edit/*mapName" let:params>
    <Fence fullscreen signal={joinServer()} loadText="Connecting to server…">
      <Edit name={params.mapName} />
    </Fence>
  </Route>
  <Route path="/">
    <Lobby />
  </Route>
</Router>
