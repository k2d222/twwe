<script lang="ts">
  import { navigate } from 'svelte-routing'
  import { showInfo, showWarning, showError, clearDialog, showDialog } from '../lib/dialog'
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
    PasswordInput,
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
  import storage from '../../storage'
  import {
    Help as AboutIcon,
    LogoGithub as GitHubIcon,
    Add as AddIcon,
    Login as JoinIcon,
    TrashCan as DeleteIcon,
    Password as KeyIcon,
  } from 'carbon-icons-svelte'
  import { createMap, download, queryConfig, queryMaps, uploadMap } from '../lib/util'
  import type { ComboBoxItem } from 'carbon-components-svelte/src/ComboBox/ComboBox.svelte'
  import type { MapDetail } from '../../server/protocol'
  import { onMount } from 'svelte'
  import { serverHttpUrl, type ServerConfig } from '../../server/server'

  type SpinnerStatus = 'active' | 'inactive' | 'finished' | 'error'
  type ServerStatus = 'unknown' | 'connecting' | 'connected' | 'error' | 'online'

  let serverCfgs = storage.load('servers')
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
    password: string
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
    password: '',
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

  let modalAccessKey = {
    open: false,
    name: '',
  }

  const statusString: { [k in ServerStatus]: [SpinnerStatus, string] } = {
    unknown: ['inactive', ''],
    connecting: ['active', 'Connecting…'],
    connected: ['finished', 'Connected'],
    error: ['error', 'Unreachable'],
    online: ['finished', 'Online'],
  }

  $: serverStatuses = serverCfgs.map<ServerStatus>(_ => 'unknown')
  $: serverCfg = serverCfgs[serverId]
  $: httpUrl = serverHttpUrl(serverCfg)

  onMount(() => {
    selectServer(serverId)
  })

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

  function selectServer(id: number) {
    serverId = id
    maps = []

    if (serverId >= serverCfgs.length) serverId = 0

    setServerStatus(id, 'connecting')

    const serverCfg = serverCfgs[id]
    const httpUrl = serverHttpUrl(serverCfg)

    queryMaps(httpUrl)
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

  function onJoinMap(name: string) {
    navigate('/edit/' + name)
  }

  async function onJoinBridge(key: string) {
    modalAccessKey.open = false
    let id = showInfo(`joining ${key}…`, 'none')

    try {
      // first, see if the key points at an unlisted map.
      const httpUrl = serverHttpUrl(serverCfg)
      const config = await queryConfig(httpUrl, key)
      onJoinMap(config.name)
    } catch (_) {
      // second, if it's not a unlisted map, it's a bridge map
      try {
        const cfg: ServerConfig = {
          ...serverCfg,
          name: 'remote: ' + key,
          path: (serverCfg.path ?? '') + '/bridge/' + key,
        }
        serverCfgs.push(cfg)

        const httpUrl = serverHttpUrl(cfg)
        let maps = await queryMaps(httpUrl)
        let name = maps[0].name

        storage.save('servers', serverCfgs, { persistent: false })
        storage.save('currentServer', serverCfgs.length - 1, { persistent: false })
        navigate('/edit/' + name)
      } catch (e) {
        showError(e)
      }
    } finally {
      clearDialog(id)
    }
  }

  function onDeleteMap(mapName: string) {
    modalConfirmDelete.name = mapName
    modalConfirmDelete.open = true
    modalConfirmDelete.onConfirm = async () => {
      try {
        let resp = await fetch(`${httpUrl}/maps/${mapName}`, {
          method: 'DELETE',
        })
        if (!resp.ok) {
          throw await resp.text()
        }
      } catch (e) {
        showError('Map deletion failed: ' + e)
        console.error(e)
      }
      modalConfirmDelete.open = false
      selectServer(serverId)
    }
  }

  function onRenameMap(_name: string) {
    alert('TODO renaming maps is not yet implemented.')
  }

  function onDownloadMap(name: string) {
    download(`${httpUrl}/maps/${name}`, `${name}.map`)
  }

  function onAddServer() {
    const { name, hostname, encrypted, port } = modalAddServer
    const conf: ServerConfig = {
      name,
      host: hostname,
      encrypted,
      port,
    }
    serverCfgs.push(conf)
    storage.save('servers', serverCfgs)
    serverCfgs = serverCfgs
    modalAddServer.open = false
  }

  function onDeleteServer(id: number) {
    serverCfgs.splice(id, 1)
    storage.save('servers', serverCfgs)
    if (serverId === id) {
      selectServer(0)
    } else if (serverId > id) {
      selectServer(serverId - 1)
    }
    serverCfgs = serverCfgs
  }

  async function onCreateMap() {
    const { name, method } = modalCreateMap

    const id = showInfo('Querying the server…', 'none')

    try {
      if (method === 'upload' && modalCreateMap.uploadFile !== null) {
        await uploadMap(httpUrl, name, modalCreateMap.uploadFile, {
          version: 'ddnet06', // TODO
          public: modalCreateMap.public,
          password: modalCreateMap.password,
        })
      } else if (method === 'blank') {
        await createMap(httpUrl, name, {
          version: 'ddnet06', // TODO
          public: modalCreateMap.public,
          password: modalCreateMap.password,
          blank: {
            w: modalCreateMap.blankWidth,
            h: modalCreateMap.blankHeight,
          },
        })
      } else if (method === 'clone' && modalCreateMap.clone !== undefined) {
        await createMap(httpUrl, name, {
          version: 'ddnet06',
          public: modalCreateMap.public,
          password: modalCreateMap.password,
          clone: maps[modalCreateMap.clone].name,
        })
      }

      clearDialog(id)
      if (!modalCreateMap.public) {
        showWarning(
          "You created a map that won't be publicly listed. To access it in the future, use the access key '" +
            name +
            "'."
        )
      }
      navigate('/edit/' + name)
    } catch (e) {
      clearDialog(id)
      showError('Map creation failed: ' + e)
    }
  }

  function shouldFilterItem(item: ComboBoxItem, value: string) {
    if (!value) return true
    return item.text.toLowerCase().includes(value.toLowerCase())
  }
</script>

<svelte:head>
  <title>DDNet Map Editor</title>
</svelte:head>

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
          <a target="_blank" rel="noreferrer" href="https://ddnet.org/">DDRaceNetwork</a>
          , a flavour of
          <a target="_blank" rel="noreferrer" href="https://www.teeworlds.com/">Teeworlds</a>
          .
        </p>
        <p>
          The project is currently in beta, expect some bugs and missing features. Please report
          your bugs and make suggestions on the
          <a target="_blank" rel="noreferrer" href="https://github.com/k2d222/twwe/issues">
            GitHub issues page
          </a>
          . Have fun!
        </p>
      </Tile>
    </Column>
  </Row>

  <Row>
    <Column lg={6}>
      <div class="head-row">
        <h3>Servers</h3>
        <Button kind="tertiary" on:click={() => (modalAddServer.open = true)} icon={AddIcon}>
          Add server
        </Button>
      </div>
      <TileGroup>
        {#each serverCfgs as server, i}
          {@const status = serverStatuses[i]}
          <RadioTile value={'' + i} checked={serverId === i} on:click={() => selectServer(i)}>
            <div style="font-weight: bold">{server.name}</div>
            <div>({server.host}:{server.port}{server.encrypted ? '' : ', unencrypted'})</div>
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

    <Column lg={10}>
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
            { key: 'join', empty: true, width: '4rem' },
            { key: 'name', value: 'Name' },
            { key: 'date', value: 'Last modified', width: '10rem' },
            { key: 'users', value: 'Users online', width: '10rem' },
            { key: 'overflow', empty: true, width: '4rem' },
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
              <Button kind="ghost" icon={KeyIcon} on:click={() => (modalAccessKey.open = true)}>
                Access key
              </Button>
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
              <div class="text-overflow">{cell.value}</div>
            {/if}
          </svelte:fragment>
        </DataTable>
      </div>
    </Column>
  </Row>
</Grid>

<Modal
  hasForm
  preventCloseOnClickOutside={true}
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
  preventCloseOnClickOutside={true}
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
            on:change={e =>
              (modalCreateMap.uploadFile = e.detail.length === 1 ? e.detail[0] : null)}
          />
        {:else}
          <FileUploaderItem
            errorSubject="File rejected by the server"
            errorBody="Please select another file."
            size="field"
            status="edit"
            on:delete={() => (modalCreateMap.uploadFile = null)}
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
    <PasswordInput
      labelText="Password (leave blank for public maps)"
      tooltipPosition="left"
      bind:value={modalCreateMap.password}
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

<Modal
  size="sm"
  bind:open={modalAccessKey.open}
  modalHeading="Join a map with an access key"
  primaryButtonText="Join"
  secondaryButtonText="Close"
  selectorPrimaryFocus="#access-key"
  on:click:button--secondary={() => (modalAccessKey.open = false)}
  on:submit={() => onJoinBridge(modalAccessKey.name)}
  primaryButtonDisabled={modalAccessKey.name === ''}
>
  <br />
  <TextInput required bind:value={modalAccessKey.name} id="access-key" labelText="Access key" />
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
