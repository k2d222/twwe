<script type="ts">
  import type { MapInfo } from '../../server/protocol'
  import { navigate } from 'svelte-routing'
  import { showInfo, showWarning, showError, clearDialog } from '../lib/dialog'
  import { Column, Row, RadioTile, TileGroup, Grid, Tile, InlineLoading, Button, Modal, TextInput, NumberInput, Toggle, DataTable, Toolbar, ToolbarContent, ToolbarSearch, OverflowMenu, OverflowMenuItem } from 'carbon-components-svelte'
  import storage, { ServerConfig } from '../../storage'
  import {
    Help as AboutIcon,
    LogoGithub as GitHubIcon,
    Add as AddIcon,
    Login as JoinIcon,
    TrashCan as DeleteIcon,
  } from 'carbon-icons-svelte'
  import { WebSocketServer } from '../../server/server'
  import { server } from '../global'
  import { onMount } from 'svelte'

  type SpinnerStatus = 'active' | 'inactive' | 'finished' | 'error'
  type ServerStatus = 'unknown' | 'connecting' | 'connected' | 'error' | 'online'

  let serverConfs = storage.load('servers')
  let serverId = storage.load('currentServer')

  let selectedServer = '' + serverId
  let maps: MapInfo[] = []

  // add server modal
  let modalAddServer = {
    open: false,
    name: 'My Server',
    hostname: '',
    port: 16900,
    encrypted: false,
  }

  const statusString: { [k in ServerStatus]: [SpinnerStatus, string] } = {
    unknown: ['inactive', ''],
    connecting: ['active', 'Connecting…'],
    connected: ['finished', 'Connected'],
    error: ['error', 'Unreachable'],
    online: ['finished', 'Online'],
  }

  $: serverStatus = serverConfs.map(_ => {
    return 'unknown' as ServerStatus
  })
    
  $: serverId = parseInt(selectedServer)

  onMount(() => {
    selectServer(0)
  })

  function setServerStatus(id: number, state: ServerStatus) {
    serverStatus[id] = state
  }

  async function queryMaps(server: WebSocketServer): Promise<MapInfo[]> {
    let { maps } = await server.query('listmaps', null)
    sortMaps(maps)
    return maps
  }
  serverConfs = serverConfs

  function sortMaps(maps: MapInfo[]): MapInfo[] {
    return maps.sort((a, b) => {
      if (a.users === b.users) return a.name.localeCompare(b.name)
      else return b.users - a.users
    })
  }

  function selectServer(id: number) {
    if (serverStatus[serverId] === 'connected') serverStatus[serverId] = 'online'
    if (serverStatus[serverId] === 'connecting') serverStatus[serverId] = 'unknown'

    maps = []
    serverId = id
    const conf = serverConfs[id]

    setServerStatus(id, 'connecting')
    $server = new WebSocketServer(conf.url)
    $server.socket.addEventListener('open', () => {
      setServerStatus(id, id === serverId ? 'connected' : 'online')
    }, { once: true })
    $server.socket.addEventListener('error', () => {
      setServerStatus(id, 'error')
    }, { once: true })
    queryMaps($server).then(res => {
      if (id === serverId) {
        storage.save('currentServer', id)
        maps = res
      }
    })
  }

  function onSelectServer(e: Event & { detail: string }) {
    const id = parseInt(e.detail)
    selectServer(id)
  }

  async function onRefresh() {
    showInfo('Updating maps infos…', 'none')
    maps = await queryMaps($server)
    clearDialog()
  }

  // async function onDelete() {
  //   if (selectedMap === null) return
    
  //   const res = await showWarning('Are you sure you want to delete "' + selectedMap + '"?', 'yesno')

  //   if (res) {
  //     showInfo('Deleting map…', 'none')
  //     try {
  //       await $server.query('deletemap', { name: selectedMap.name })
  //       clearDialog()
  //       onRefresh()
  //     } catch (e) {
  //       showError('Map deletion failed: ' + e)
  //     }
  //   }
  // }

  function onJoinMap(name: string) {
    navigate('/edit/' + name)
  }

  function onAddServer() {
    const { name, hostname, encrypted, port } = modalAddServer
    const url = (encrypted ? 'wss://' : 'ws://') + hostname + ':' + port
    const conf: ServerConfig = {
      name,
      url,
    }
    serverConfs.push(conf)
    storage.save('servers', serverConfs)
    serverConfs = serverConfs
    modalAddServer.open = false
  }

  function onDeleteServer(id: number) {
    serverConfs.splice(id, 1)
    storage.save('servers', serverConfs)
    serverConfs = serverConfs
  }

  // TODO: restore this
  // function onKeyPress(e: Event & { currentTarget: HTMLInputElement }) {
  //   searchTerm = e.currentTarget.value
  // }

  // function updateSelection(offset: number) {
  //   const options = document.querySelectorAll('input')
  //   let currentIndex = 0
  //   let counter = 0
  //   options.forEach(option => {
  //     if (option.checked) {
  //       currentIndex = counter
  //     }
  //     counter++
  //   })
  //   const nextOption = currentIndex + offset
  //   if (nextOption >= 0 && nextOption < options.length) {
  //     options[currentIndex].checked = false
  //     options[nextOption].checked = true
  //     selectedMap = options[nextOption].value
  //   }
  // }

  // function onload(element: HTMLElement) {
  //   // auto focus search box on page load
  //   element.focus()
  //   element.addEventListener('keydown', (event: KeyboardEvent) => {
  //     if (event.key === 'ArrowDown') {
  //       updateSelection(1)
  //     } else if (event.key === 'ArrowUp') {
  //       updateSelection(-1)
  //     } else if (event.key === 'Enter') {
  //       navigate('/edit/' + selectedMap)
  //     }
  //   })
  // }

  
</script>

<style>
  .head-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .delete {
    position: absolute;
    bottom: 0;
    right: 0;
  }
</style>

<div id="menu">
  <div class="left">
  </div>
  <div class="middle">
    <span>Teeworlds Web Editor</span>
  </div>
  <div class="right">
      <button id="about" disabled>
        <AboutIcon size={20} title="About" />
      </button>
      <a target="_blank" rel="noreferrer" href="https://github.com/k2d222/twwe/">
        <button id="about">
          <GitHubIcon size={20} title="Github" />
        </button>
      </a>
  </div>
</div>

<Grid padding id="lobby">
  <Row>
    <Column>
      <Tile>
        <p>
          Teeworlds Web Editor is a multiplayer map editor for
          <a href="https://ddnet.org/">DDRaceNetwork</a>, a flavour of
          <a href="https://www.teeworlds.com/">Teeworlds</a>.
        </p>
        <p>
          The project is currently in beta, expect some bugs and missing features! Please report your bugs and make suggestions on the
          <a href="https://github.com/k2d222/twwe/issues">GitHub issues page</a>.
          Have fun!
        </p>
      </Tile>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="head-row">
        <h3>Servers</h3>
        <Button kind="tertiary" on:click={() => modalAddServer.open = true} icon={AddIcon}>Add server</Button>
      </div>
      <TileGroup bind:selected={selectedServer} on:select={onSelectServer}>
        {#each serverConfs as server, i}
          {@const url = new URL(server.url)}
          {@const status = serverStatus[i]}
          <RadioTile value={'' + i}>
            <div style='font-weight: bold'>{server.name}</div>
            <div>({url.host}{url.protocol === 'ws:' ? ', unencrypted': ''})</div>
            <div><InlineLoading status={statusString[status][0]} description={statusString[status][1]} /></div>
            {#if i !== 0}
              <div class='delete'>
                <Button kind="danger-ghost" icon={DeleteIcon} on:click={() => onDeleteServer(i)} />
              </div>
            {/if}
          </RadioTile>
        {/each}
      </TileGroup>
    </Column>

    <Column lg={8} max={8}>
      <div class="head-row">
        <h3>Maps</h3>
        <Button kind="tertiary" on:click={() => modalAddServer.open = true} icon={AddIcon}>Add map</Button>
      </div>
      <div class="table-wrapper">
        <DataTable
          sortable
          headers={[
            { key: 'name', value: 'Name' },
            { key: 'users', value: 'Users online' },
            { key: 'date', value: 'Last modified' },
            { key: "join", empty: true },
            { key: "overflow", empty: true },
          ]}
          rows={
            maps.map((row, i) => ({
              id: i,
              name: row.name,
              users: row.users,
              date: 'N/A',
              join: row.name,
              overflow: row.name,
            }))
          }
        >
          <Toolbar>
            <ToolbarContent>
              <ToolbarSearch
                persistent
                value=""
                shouldFilterRows
              />
            </ToolbarContent>
          </Toolbar>
          <svelte:fragment slot="cell" let:cell>
            {#if cell.key === "overflow"}
              <OverflowMenu flipped>
                <OverflowMenuItem text="Join" on:click={() => onJoinMap(cell.value)} />
                <OverflowMenuItem danger text="Delete" on:click={() => alert("TODO: Not implemented")} />
              </OverflowMenu>
            {:else if cell.key === "join"}
              <Button
                kind="ghost"
                icon={JoinIcon}
                iconDescription="Join map"
                on:click={() => onJoinMap(cell.value)}
              />
            {:else}
              {cell.value}
            {/if}
          </svelte:fragment>
        </DataTable>
      </div>
    </Column>
  </Row>
</Grid>

<Modal
  hasForm
  modalHeading="Add a server"
  primaryButtonText="Save"
  secondaryButtonText="Cancel"
  primaryButtonDisabled={modalAddServer.hostname === '' || modalAddServer.name === ''}
  on:submit={onAddServer}
  on:click:button--secondary={() => modalAddServer.open = false}
  bind:open={modalAddServer.open}
  size="sm"
>
  <div class="form">
    <TextInput required labelText="Display name" bind:value={modalAddServer.name} />
    <TextInput required labelText="Server ip or address" placeholder="example.com" bind:value={modalAddServer.hostname} />
    <NumberInput label="Port" bind:value={modalAddServer.port} />
    <Toggle labelText="Encrypted server" bind:toggled={modalAddServer.encrypted} />
  </div>
</Modal>
