<script lang="ts">
  import { InlineNotification, Toggle } from 'carbon-components-svelte'
  import storage from '../../storage'
  import { generate } from 'random-words'
  import { serverCfg, map } from '../global'
  import { serverHttpUrl, serverWsUrl } from '../../server/util'
  import { showError } from './dialog'

  let serverId = storage.load('currentServer')
  let serverCfgs = storage.load('servers')
  serverCfgs.splice(serverId, 1)

  let shareId = 0
  let shareName = generate({ exactly: 4, join: '-' })
  let shareEnabled = false

  $: shareCfg = serverCfgs[shareId]

  async function startBridge(): Promise<void> {
    const httpUrl = serverHttpUrl($serverCfg) + '/bridge_open'
    const shareUrl = serverWsUrl(shareCfg) + '/bridge'
    console.log(shareUrl)
    const json = {
      url: shareUrl,
      map: $map.name,
      key: shareName,
    }
    try {
      let resp = await fetch(httpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      })
      if (!resp.ok) throw await resp.text()
    } catch (e) {
      showError(e)
      shareEnabled = false
    }
  }

  async function stopBridge(): Promise<void> {
    const httpUrl = serverHttpUrl($serverCfg) + '/bridge_close'
    await fetch(httpUrl)
  }

  function onToggleSharing() {
    if (shareEnabled) {
      startBridge()
    } else {
      stopBridge()
    }
  }
</script>

<div class="edit-sharing">
  <p>
    In this dialog you can open access to your map on the internet, so other tees can connect and
    edit with you.
  </p>
  <InlineNotification
    lowContrast
    hideCloseButton
    kind="warning"
    title="Tees who connect to your map can destroy your progress! Be careful who you give access to."
  />
  <label>
    Remote server
    <select bind:value={shareId}>
      {#each serverCfgs as server, id}
        <option value={id}>{server.name} ({server.host}:{server.port})</option>
      {/each}
    </select>
  </label>
  <label>
    Access key
    <input type="text" bind:value={shareName} />
  </label>
  {#if shareCfg}
    <InlineNotification
      lowContrast
      hideCloseButton
      kind="info"
      title="How can others connect?"
      subtitle="From the start screen, add a server with address {shareCfg.host} and port {shareCfg.port}. Then, join the map with the Access key 🔑 '{shareName}'."
    />
    <Toggle
      on:toggle={onToggleSharing}
      bind:toggled={shareEnabled}
      labelA="Sharing disabled"
      labelB="Sharing enabled"
    />
  {/if}
</div>
