<script lang="ts">
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
  import * as Actions from '../actions'
  import { viewport } from '../../gl/global'
  import Fence from './fence.svelte'
  import type { AutomapperKind, Recv, Tiles } from '../../server/protocol'

  // split panes
  let layerPaneSize = px2vw(rem2px(15))
  let propsPaneSize = px2vw(rem2px(20))
  let envPaneSize = px2vw(rem2px(20))
  let lastLayerPaneSize = layerPaneSize
  let lastPropsPaneSize = propsPaneSize
  let lastEnvPaneSize = 20
  let closedPaneThreshold = px2vw(rem2px(2))

  // computed (readonly)
  let g: number = -1, l: number = -1
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
    $server.query('create/group', { name: '' })
  }
  function serverOnUsers(e: number) {
    $peers = e
  }
  function serverOnEditTiles([g, l, e]: [number, number, Tiles]) {
    let layer = $rmap.map.groups[g].layers[l] as AnyTilesLayer<any>
    let kind = tilesLayerFlagsToLayerKind(layer.flags)
    const tiles = dataToTiles(e.tiles, kind)

    for (let i = 0; i < tiles.length; ++i) {
      const tile = tiles[i]
      const x = i % e.w
      const y = Math.floor(i / e.w)

      $rmap.editTile({ g, l, x: x + e.x, y: y + e.y, ...tile })
    }
  }
  async function serverOnApplyAutomapper([g, l]: Recv['edit/automap']) {
    const data = await $server.query('get/tiles', [g, l])
    const layer = $rmap.groups[g].layers[l].layer as AnyTilesLayer<any>
    const tiles = dataToTiles(data, tilesLayerFlagsToLayerKind(layer.flags))

    for (let i = 0; i < tiles.length; ++i) {
      const tile = tiles[i]
      const x = i % layer.width
      const y = Math.floor(i / layer.width)

      $rmap.editTile({ g, l, x, y, ...tile }) }
  }
  function serverOnDeleteAutomapper(e: Recv['delete/automapper']) {
    delete $automappers[e]
    $automappers = $automappers
  }
  function serverOnUploadAutomapper([name, file]: Recv['create/automapper']) {
    const kind = name.slice(name.lastIndexOf('.') + 1) as AutomapperKind
    const image = name.slice(0, name.lastIndexOf('.'))
    $automappers[name] = {
      name,
      image,
      file,
      kind,
    }
    $automappers = $automappers
  }
  function serverOnError(e: string) {
    showError('Server Error: ' + e)
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
    $server.on('users', serverOnUsers)
    $server.on('edit/tiles', serverOnEditTiles)
    $server.on('edit/automap', serverOnApplyAutomapper)
    $server.on('delete/automapper', serverOnDeleteAutomapper)
    $server.on('create/automapper', serverOnUploadAutomapper)
    $server.onError(serverOnError)
    $server.query('get/users', undefined)
      .then(u => $peers = u)

    viewport.canvas.addEventListener('mouseenter', onHoverCanvas)

    signalLoaded()
  })

  onDestroy(() => {
    $server.socket.removeEventListener('error', onServerClosed)
    $server.off('users', serverOnUsers)
    $server.off('edit/tiles', serverOnEditTiles)
    $server.off('edit/automap', serverOnApplyAutomapper)
    $server.off('delete/automapper', serverOnDeleteAutomapper)
    $server.off('create/automapper', serverOnUploadAutomapper)

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

  function onUndo() {
    $server.undo()
  }

  function onRedo() {
    $server.redo()
  }

  function onKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    if (!target.contains(viewport.canvas)) return

    Editor.fire('keydown', e)

    if (e.ctrlKey && ['s', ' ', 'z', 'y'].includes(e.key)) {
      e.preventDefault()

      if (e.key === 's') {
        Actions.saveMap()
      } else if (e.key === ' ') {
        onToggleAnim()
      } else if (e.key === 'z') {
        onUndo()
      } else if (e.key === 'y') {
        onRedo()
      }
    }
    else if (['Tab'].includes(e.key)) {
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
            <LayerEditor {g} {l} />
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
