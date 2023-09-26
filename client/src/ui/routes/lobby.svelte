<script lang="ts">
  import { navigate } from 'svelte-routing'
  import { showInfo, showWarning, showError, clearDialog } from '../lib/dialog'
  import {
    Column,
    Row,
    RadioTile,
    TileGroup,
    Grid,
    Tile,
    InlineLoading,
    Button,
    Modal,
    TextInput,
    NumberInput,
    Toggle,
    DataTable,
    Toolbar,
    ToolbarContent,
    ToolbarSearch,
    OverflowMenu,
    OverflowMenuItem,
    FormGroup,
    FileUploaderItem,
    FileUploaderDropContainer,
    RadioButtonGroup,
    RadioButton,
    ComboBox,
  } from 'carbon-components-svelte'
  import storage, { type ServerConfig } from '../../storage'
  import {
    Help as AboutIcon,
    LogoGithub as GitHubIcon,
    Add as AddIcon,
    Login as JoinIcon,
    TrashCan as DeleteIcon,
  } from 'carbon-icons-svelte'
  import { createMap, download, queryMaps, uploadMap } from '../lib/util'
  import type { ComboBoxItem } from 'carbon-components-svelte/types/ComboBox/ComboBox.svelte'
  import type { MapDetail } from '../../server/protocol'

  type SpinnerStatus = 'active' | 'inactive' | 'finished' | 'error'
  type ServerStatus = 'unknown' | 'connecting' | 'connected' | 'error' | 'online'

  let serverConfs = storage.load('servers')
  let serverId = storage.load('currentServer')

  let maps: MapDetail[] = []

  interface ModalAddServer {
    open: boolean
    name: string
    hostname: string
    port: number
    encrypted: boolean
  }

  let modalAddServer: ModalAddServer = {
    open: false,
    name: 'My Server',
    hostname: '',
    port: 16900,
    encrypted: false,
  }

  interface ModalCreateMap {
    open: boolean
    name: string
    public: boolean
    method: 'upload' | 'blank' | 'clone'
    clone: number | undefined
    cloneItems: { id: number; text: string }[]
    uploadFile: File | null
    blankWidth: number
    blankHeight: number
  }

  let modalCreateMap: ModalCreateMap = {
    open: false,
    name: 'My Map',
    public: true,
    method: 'upload',
    clone: undefined,
    cloneItems: [],
    uploadFile: null,
    blankWidth: 100,
    blankHeight: 100,
  }

  let modalConfirmDelete = {
    open: false,
    name: '',
    onConfirm: () => {},
  }

  const statusString: { [k in ServerStatus]: [SpinnerStatus, string] } = {
    unknown: ['inactive', ''],
    connecting: ['active', 'Connecting…'],
    connected: ['finished', 'Connected'],
    error: ['error', 'Unreachable'],
    online: ['finished', 'Online'],
  }

  $: serverStatuses = serverConfs.map<ServerStatus>(_ =>  'unknown')

  $: {
    maps = []

    if (serverId >= serverConfs.length)
      serverId = 0

    const id = serverId
    setServerStatus(id, 'connecting')

    queryMaps(serverConfs[id].httpUrl)
      .then(m => {
        if (serverId === id) {
          maps = m
          storage.save('currentServer', id)
          resetMapModal()
        }
        setServerStatus(id, 'online')
      })
      .catch(_ => {
        setServerStatus(id, 'error')
      })
  }

  function resetMapModal() {
    modalCreateMap.uploadFile = null
    modalCreateMap.clone = undefined
    modalCreateMap.cloneItems = maps.map((m, i) => ({
      id: i,
      text: m.name,
    }))
  }

  function setServerStatus(id: number, state: ServerStatus) {
    serverStatuses[id] = state
  }

  function onSelectServer(e: Event & { detail: string }) {
    serverId = parseInt(e.detail)
  }

  function onJoinMap(name: string) {
    navigate('/edit/' + name)
  }

  function onDeleteMap(mapName: string) {
    const httpRoot = serverConfs[serverId].httpUrl
    modalConfirmDelete.name = mapName
    modalConfirmDelete.open = true
    modalConfirmDelete.onConfirm = async () => {
      try {
        await fetch(`${httpRoot}/maps/${mapName}`, {
          method: 'DELETE'
        })
      } catch (e) {
        showError('Map deletion failed: ' + e)
      }
      modalConfirmDelete.open = false
      serverId = serverId
    }
  }

  function onRenameMap(_name: string) {
    alert('TODO renaming maps is not yet implemented.')
  }

  function onDownloadMap(name: string) {
    download(`${serverConfs[serverId].httpUrl}/maps/${name}`, `${name}.map`)
  }

  function onAddServer() {
    const { name, hostname, encrypted, port } = modalAddServer
    const wsUrl = (encrypted ? 'wss://' : 'ws://') + hostname + ':' + port + '/ws'
    const httpUrl = (encrypted ? 'https://' : 'http://') + hostname + ':' + port
    const conf: ServerConfig = {
      name,
      wsUrl,
      httpUrl,
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

  async function onCreateMap() {
    const { name, method } = modalCreateMap
    const access = modalCreateMap.public ? 'public' : 'unlisted'

    showInfo('Querying the server…', 'none')

    if (method === 'upload' && modalCreateMap.uploadFile !== null) {
      await uploadMap(serverConfs[serverId].httpUrl, name, modalCreateMap.uploadFile)
    }
    else if (method === 'blank') {
      await createMap(serverConfs[serverId].httpUrl, name, {
        version: 'ddnet06', // TODO
        access,
        blank: {
          w: modalCreateMap.blankWidth,
          h: modalCreateMap.blankHeight,
        }
      })
    }
    else if (method === 'clone' && modalCreateMap.clone !== undefined) {
      await createMap(serverConfs[serverId].httpUrl, name, {
        version: 'ddnet06',
        access,
        clone: maps[modalCreateMap.clone].name
      })
    }

    try {
      clearDialog()
      if (access === 'unlisted') {
        const url = window.location.origin + '/edit/' + encodeURIComponent(name)
        showWarning(
          "You created a private map that won't be publicly listed. To access it in the future, use this URL: " +
            url
        )
      }
      navigate('/edit/' + name)
    } catch (e) {
      showError('Map creation failed: ' + e)
    }
  }

  function shouldFilterItem(item: ComboBoxItem, value: string) {
    if (!value) return true
    return item.text.toLowerCase().includes(value.toLowerCase())
  }
</script>

<div id="header">
  <div class="left" />
  <div class="middle">
    <span>Teeworlds Web Editor</span>
  </div>
  <div class="right">
    <button class="header-btn" id="about" disabled>
      <AboutIcon size={20} title="About" />
    </button>
    <a target="_blank" rel="noreferrer" href="https://github.com/k2d222/twwe/">
      <button class="header-btn" id="about">
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
          <a href="https://ddnet.org/">DDRaceNetwork</a>
          , a flavour of
          <a href="https://www.teeworlds.com/">Teeworlds</a>
          .
        </p>
        <p>
          The project is currently in beta, expect some bugs and missing features! Please report
          your bugs and make suggestions on the
          <a href="https://github.com/k2d222/twwe/issues">GitHub issues page</a>
          . Have fun!
        </p>
      </Tile>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="head-row">
        <h3>Servers</h3>
        <Button kind="tertiary" on:click={() => (modalAddServer.open = true)} icon={AddIcon}>
          Add server
        </Button>
      </div>
      <TileGroup on:select={onSelectServer}>
        {#each serverConfs as server, i}
          {@const url = new URL(server.wsUrl)}
          {@const status = serverStatuses[i]}
          <RadioTile value={'' + i}>
            <div style="font-weight: bold">{server.name}</div>
            <div>({url.host}{url.protocol === 'ws:' ? ', unencrypted' : ''})</div>
            <div>
              <InlineLoading
                status={statusString[status][0]}
                description={statusString[status][1]}
              />
            </div>
            {#if i !== 0}
              <div class="delete">
                <Button
                  kind="danger-ghost"
                  iconDescription="Remove server"
                  icon={DeleteIcon}
                  on:click={() => onDeleteServer(i)}
                />
              </div>
            {/if}
          </RadioTile>
        {/each}
      </TileGroup>
    </Column>

    <Column lg={8} max={8}>
      <div class="head-row">
        <h3>Maps</h3>
        <Button kind="tertiary" on:click={() => (modalCreateMap.open = true)} icon={AddIcon}>
          Add map
        </Button>
      </div>
      <div class="table-wrapper">
        <DataTable
          sortable
          headers={[
            { key: 'name', value: 'Name' },
            { key: 'users', value: 'Users online' },
            { key: 'date', value: 'Last modified' },
            { key: 'overflow', empty: true },
            { key: 'join', empty: true },
          ]}
          rows={maps.map((row, i) => ({
            id: i,
            name: row.name,
            users: row.users,
            date: 'N/A',
            join: row.name,
            overflow: row.name,
          }))}
        >
          <Toolbar>
            <ToolbarContent>
              <ToolbarSearch persistent value="" shouldFilterRows />
            </ToolbarContent>
          </Toolbar>
          <svelte:fragment slot="cell" let:cell>
            {#if cell.key === 'overflow'}
              <OverflowMenu flipped>
                <OverflowMenuItem text="Join" on:click={() => onJoinMap(cell.value)} />
                <OverflowMenuItem text="Rename" on:click={() => onRenameMap(cell.value)} />
                <OverflowMenuItem text="Download" on:click={() => onDownloadMap(cell.value)} />
                <OverflowMenuItem danger text="Delete" on:click={() => onDeleteMap(cell.value)} />
              </OverflowMenu>
            {:else if cell.key === 'join'}
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
  on:click:button--secondary={() => (modalAddServer.open = false)}
  bind:open={modalAddServer.open}
  size="sm"
>
  <div class="form">
    <TextInput
      required
      invalid={modalAddServer.name === ''}
      invalidText="This field is required"
      labelText="Display name"
      bind:value={modalAddServer.name}
    />
    <TextInput
      required
      invalid={modalAddServer.hostname === ''}
      invalidText="This field is required"
      labelText="Server ip or address"
      placeholder="example.com"
      bind:value={modalAddServer.hostname}
    />
    <NumberInput label="Port" bind:value={modalAddServer.port} />
    <Toggle labelText="Encrypted server (https/tls)" bind:toggled={modalAddServer.encrypted} />
  </div>
</Modal>

<Modal
  hasForm
  modalHeading="Create a map"
  primaryButtonText="Create"
  secondaryButtonText="Cancel"
  primaryButtonDisabled={(modalCreateMap.method === 'upload' &&
    modalCreateMap.uploadFile === null) ||
    (modalCreateMap.method === 'clone' && typeof modalCreateMap.clone !== 'number') ||
    modalCreateMap.name === '' ||
    maps.findIndex(m => m.name === modalCreateMap.name) !== -1}
  on:submit={onCreateMap}
  on:click:button--secondary={() => (modalCreateMap.open = false)}
  bind:open={modalCreateMap.open}
  size="sm"
>
  <div class="form">
    <TextInput
      required
      labelText="Map name"
      invalid={modalCreateMap.name === '' ||
        maps.findIndex(m => m.name === modalCreateMap.name) !== -1}
      invalidText={modalCreateMap.name === ''
        ? 'This field is required.'
        : 'This name is already taken.'}
      bind:value={modalCreateMap.name}
    />
    <RadioButtonGroup bind:selected={modalCreateMap.method} legendText="Creation method">
      <RadioButton value="upload" labelText="Upload" />
      <RadioButton value="blank" labelText="Blank" />
      <RadioButton value="clone" labelText="Clone" />
    </RadioButtonGroup>
    {#if modalCreateMap.method === 'upload'}
      <FormGroup legendText="Upload a .map file" style="margin-bottom: 0">
        {#if modalCreateMap.uploadFile === null}
          <FileUploaderDropContainer
            accept={['.map']}
            labelText="Click to upload"
            on:change={(e) => modalCreateMap.uploadFile = e.detail.length === 1 ? e.detail[0] : null}
          />
        {:else}
          <FileUploaderItem
            errorSubject="File rejected by the server"
            errorBody="Please select another file."
            size="field"
            status="edit"
            on:delete={() => modalCreateMap.uploadFile = null}
            name={modalCreateMap.uploadFile.name}
          />
        {/if}
      </FormGroup>
    {:else if modalCreateMap.method === 'clone'}
      <ComboBox
        titleText="Map to clone"
        placeholder="Select a map to clone on the server"
        invalid={typeof modalCreateMap.clone !== 'number'}
        invalidText="This field is required"
        {shouldFilterItem}
        direction="top"
        bind:selectedId={modalCreateMap.clone}
        items={modalCreateMap.cloneItems}
      />
    {:else if modalCreateMap.method === 'blank'}
      <NumberInput min={0} bind:value={modalCreateMap.blankWidth} label="Width" />
      <NumberInput min={0} bind:value={modalCreateMap.blankHeight} label="Height" />
    {/if}
    <Toggle
      labelText="Visibility"
      labelA="unlisted"
      labelB="public"
      bind:toggled={modalCreateMap.public}
    />
  </div>
</Modal>

<Modal
  danger
  modalHeading="Confirm deletion"
  primaryButtonText="Delete"
  primaryButtonIcon={DeleteIcon}
  secondaryButtonText="Cancel"
  on:click:button--secondary={() => (modalConfirmDelete.open = false)}
  bind:open={modalConfirmDelete.open}
  on:submit={modalConfirmDelete.onConfirm}
>
  <p>
    The map "{modalConfirmDelete.name}" will be permanently deleted from the server. Make sure you
    made a backup.
  </p>
</Modal>

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
