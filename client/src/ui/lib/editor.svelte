<script lang="ts">
  import type {
    ServerError,
    EditTile,
    ListUsers,
    EditTiles,
    ApplyAutomapper,
    AutomapperDetail,
  } from '../../server/protocol'
  import { LayerType } from '../../twmap/types'
  import { AnyTilesLayer, GameLayer } from '../../twmap/tilesLayer'
  import { onMount, onDestroy } from 'svelte'
  import { server, rmap, selected, automappers, anim, peers } from '../global'
  import TreeView from './treeView.svelte'
  import { showError } from './dialog'
  import EnvelopeEditor from './envelopeEditor.svelte'
  import * as Editor from './editor'
  import { px2vw, rem2px } from './util'
  import { Pane, Splitpanes } from 'svelte-splitpanes'
  import LayerEditor from './editLayer.svelte'
  import GroupEditor from './editGroup.svelte'
  import MapEditor from './mapEditor.svelte'
  import {
    Add as CreateGroupIcon,
  } from 'carbon-icons-svelte'
  import {
    Button,
  } from 'carbon-components-svelte'
  import { navigate } from 'svelte-routing'
  import { dataToTiles, tilesLayerFlagsToLayerKind } from '../../server/convert'
  import type * as MapDir from '../../twmap/mapdir'
  import * as Actions from '../actions'
  import { viewport } from '../../gl/global'
  import Fence from './fence.svelte'

  // split panes
  let layerPaneSize = px2vw(rem2px(15))
  let propsPaneSize = px2vw(rem2px(20))
  let envPaneSize = px2vw(rem2px(20))
  let lastLayerPaneSize = layerPaneSize
  let lastPropsPaneSize = propsPaneSize
  let lastEnvPaneSize = 20
  let closedPaneThreshold = px2vw(rem2px(2))

  // computed (readonly)
  let g: number, l: number
  $: {
    if ($selected.length === 0) {
      g = -1
      l = -1
    }
    else {
      g = $selected[$selected.length - 1][0]
      l = $selected[$selected.length - 1][1]
    }
  }

  let selectedTileLayers: number[] = []
  $: if ($rmap) {
    selectedTileLayers = $selected
      .map(([_, l]) => l)
      .filter(l => l !== -1 && $rmap.map.groups[g].layers[l].type === LayerType.TILES)
  }

  function onCreateGroup() {
    $server.query('creategroup', { name: '' })
  }
  function serverOnUsers(e: ListUsers) {
    $peers = e.roomCount
  }
  function serverOnEditTile(e: EditTile) {
    $rmap.editTile(e)
  }
  function serverOnEditTiles(e: EditTiles) {
    const tiles = dataToTiles(e.data, e.kind as MapDir.LayerKind)

    for (let i = 0; i < tiles.length; ++i) {
      const tile = tiles[i]
      const x = i % e.width
      const y = Math.floor(i / e.width)

      $rmap.editTile({
        group: e.group,
        layer: e.layer,
        x: x + e.x,
        y: y + e.y,
        ...tile
      })
    }
  }
  async function serverOnApplyAutomapper(e: ApplyAutomapper) {
    const data = await $server.query('sendlayer', { group: g, layer: l })
    const layer = $rmap.groups[e.group].layers[e.layer].layer as AnyTilesLayer<any>
    const tiles = dataToTiles(data, tilesLayerFlagsToLayerKind(layer.flags))

    for (let i = 0; i < tiles.length; ++i) {
      const tile = tiles[i]
      const x = i % layer.width
      const y = Math.floor(i / layer.width)

      $rmap.editTile({
        group: g,
        layer: l,
        x,
        y,
        ...tile
      })
    }
  }
  function serverOnDeleteAutomapper(e: string) {
    delete $automappers[e]
    $automappers = $automappers
  }
  function serverOnUploadAutomapper(e: AutomapperDetail) {
    $automappers[e.file] = e
    $automappers = $automappers
  }
  function serverOnError(e: ServerError) {
    if ('serverError' in e) {
      showError(
        'The server met an unexpected error. You should download or save the map, then reload the page.',
        'closable'
      )
    } else if ('mapError' in e) {
      console.error('map error', e)
      showError(
        'The server met an unexpected error and the map got corrupted. Reload the page to rollback to last save.',
        'closable'
      )
    }
  }

  async function onServerClosed() {
    await showError('You have been disconnected from the server.')
    navigate('/')
  }

  let signalLoaded: () => void
  let loadSignal: Promise<void> = new Promise(resolve => {
    signalLoaded = resolve
  })

  onMount(() => {
    $selected = [$rmap.map.physicsLayerIndex(GameLayer)]
    $server.socket.addEventListener('close', onServerClosed, { once: true })
    $server.on('listusers', serverOnUsers)
    $server.on('edittile', serverOnEditTile)
    $server.on('edittiles', serverOnEditTiles)
    $server.on('applyautomapper', serverOnApplyAutomapper)
    $server.on('deleteautomapper', serverOnDeleteAutomapper)
    $server.on('uploadautomapper', serverOnUploadAutomapper)
    $server.on('error', serverOnError)
    $server.send('listusers')

    viewport.canvas.addEventListener('mouseenter', onHoverCanvas)

    signalLoaded()
  })

  onDestroy(() => {
    $server.socket.removeEventListener('error', onServerClosed)
    $server.off('listusers', serverOnUsers)
    $server.off('edittile', serverOnEditTile)
    $server.off('edittiles', serverOnEditTiles)
    $server.off('applyautomapper', serverOnApplyAutomapper)
    $server.off('deleteautomapper', serverOnDeleteAutomapper)
    $server.off('uploadautomapper', serverOnUploadAutomapper)
    $server.off('error', serverOnError)

    viewport.canvas.removeEventListener('mouseenter', onHoverCanvas)
  })

  function onHoverCanvas() {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    viewport.canvas.focus()
  }

  function onTogglePanes() {
    if (layerPaneSize < closedPaneThreshold && propsPaneSize < closedPaneThreshold && envPaneSize < closedPaneThreshold) {
      layerPaneSize = lastLayerPaneSize
      propsPaneSize = lastPropsPaneSize
      envPaneSize = lastEnvPaneSize
    } else {
      lastLayerPaneSize = layerPaneSize
      lastPropsPaneSize = propsPaneSize
      lastEnvPaneSize = envPaneSize
      layerPaneSize = 0
      propsPaneSize = 0
      envPaneSize = 0
    }
  }

  function onToggleAnim() {
    $anim = !$anim
  }

  function onKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    if (!target.contains(viewport.canvas)) return

    Editor.fire('keydown', e)

    if (e.ctrlKey && ['s', 'd', ' '].includes(e.key)) {
      e.preventDefault()

      if (e.key === 's') {
        Actions.saveMap()
      } else if (e.key === ' ') {
        onToggleAnim()
      }
    } else if (['Tab'].includes(e.key)) {
      e.preventDefault()

      if (e.key === 'Tab') {
        onTogglePanes()
      }
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    if (!target.contains(viewport.canvas)) return

    Editor.fire('keyup', e)
  }

  function onKeyPress(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    if (!target.contains(viewport.canvas)) return

    Editor.fire('keypress', e)
  }


</script>

<svelte:window on:keydown={onKeyDown} on:keyup={onKeyUp} on:keypress={onKeyPress} />

<div id="editor">

  <Splitpanes horizontal id="panes" dblClickSplitter={false}>
    <Pane size={100 - envPaneSize}>
      <Splitpanes dblClickSplitter={false}>
        <Pane class="layers" bind:size={layerPaneSize}>
          <Fence signal={loadSignal}>
            <TreeView />
          </Fence>
          <Button
            id="create-group"
            size="field"
            kind="ghost"
            icon={CreateGroupIcon}
            on:click={onCreateGroup}
          >
            Add group
          </Button>
        </Pane>

        <Pane class="viewport" size={100 - layerPaneSize - propsPaneSize}>
          <MapEditor />
        </Pane>

        <Pane class="properties" bind:size={propsPaneSize}>
          {#if $selected.length > 1}
            <div class="edit-multiple">
              <h3 class="bx--modal-header__heading">Multiple selection</h3>
              {#if selectedTileLayers.length > 1}
                <span>You selected {selectedTileLayers.length} tile layers.</span>
                <span>You can edit the tiles from these layers together with your brush (clone, delete and repeat).</span>
              {:else}
                <span>You selected multiple layers.</span>
                <span>Editing quad layers together is not implemented yet. You can only edit tiles layers together.</span>
              {/if}
            </div>
          {:else if l !== -1}
            <LayerEditor />
          {:else if g !== -1}
            <GroupEditor {g} />
          {:else}
            <div class="edit-multiple">
              <h3 class="bx--modal-header__heading">No selection</h3>
              <span>Select a group or a layer in the left bar.</span>
            </div>
          {/if}
        </Pane>
      </Splitpanes>
    </Pane>

    <Pane bind:size={envPaneSize}>
      <EnvelopeEditor />
    </Pane>
  </Splitpanes>

</div>
