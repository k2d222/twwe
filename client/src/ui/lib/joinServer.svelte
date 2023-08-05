<script lang="ts">
  import storage from '../../storage'
  import { InlineNotification, Loading } from 'carbon-components-svelte'
  import { WebSocketServer } from '../../server/server'
  import { server, serverConfig } from '../global'

  const serverConfs = storage.load('servers')
  const serverId = storage.load('currentServer')
  const serverConf = serverConfs[serverId]
  const url = new URL(serverConf.wsUrl)

  let connected = false
  let error = false

  $serverConfig = serverConf
  $server = new WebSocketServer(serverConf.wsUrl)
  $server.socket.addEventListener('open', () => (connected = true), { once: true })
  $server.socket.addEventListener('error', () => (error = true), { once: true })
</script>

{#if connected}
  <slot />
{:else if error}
  <InlineNotification
    kind="error"
    hideCloseButton
    title="Error:"
    subtitle="Failed to connect to the server."
  />
{:else}
  <Loading description="Connecting to {url.host}…" />
{/if}
