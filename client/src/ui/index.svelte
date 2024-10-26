<script lang="ts">
  import { Router, Route } from 'svelte-routing'
  import Lobby from './routes/lobby.svelte'
  import Edit from './routes/edit.svelte'
  import Fence from './lib/fence.svelte'
  import storage from '../storage'
  import { WebSocketServer } from '../server/server'
  import { server, serverCfg } from './global'
  import { queryConfig } from './lib/util'

  export let url = ''

  async function joinServer(params: { [name: string]: string }) {
    const serverCfgs = storage.load('servers')
    const serverId = storage.load('currentServer')

    $serverCfg = serverCfgs[serverId]
    console.log('joining server', $serverCfg)
    $server = new WebSocketServer($serverCfg)

    const connected = new Promise((resolve, reject) => {
      $server.socket.addEventListener('open', resolve, { once: true })
      $server.socket.addEventListener('error', () => reject('Failed to connect to the server'), {
        once: true,
      })
    })
    await connected

    // let config = await queryConfig($serverCfg, params.mapName)
    let config = await $server.query('config', params.mapName)
    console.log('joining map', config)

    if (config.password) {
      return prompt('enter password')
    } else {
      return ''
    }
  }
</script>

<Router {url}>
  <Route path="edit/*mapName" let:params>
    {@const signal = joinServer(params)}
    <Fence fullscreen {signal} let:result={password} loadText="Connecting to server…">
      <Edit name={params.mapName} {password} />
    </Fence>
  </Route>
  <Route path="/">
    <Lobby />
  </Route>
</Router>
