<script lang="ts">
  import type {
    ServerError,
    EditMap,
    EditTile,
    CreateQuad,
    EditQuad,
    DeleteQuad,
    CreateEnvelope,
    EditEnvelope,
    DeleteEnvelope,
    CreateGroup,
    EditGroup,
    DeleteGroup,
    ReorderGroup,
    CreateLayer,
    EditLayer,
    DeleteLayer,
    ReorderLayer,
    CreateImage,
    DeleteImage,
    ListUsers,
    EditTiles,
    ApplyAutomapper,
    AutomapperConfigs,
  } from '../../server/protocol'
  import type { Layer } from '../../twmap/layer'
  import type { Group } from '../../twmap/group'
  import { LayerType } from '../../twmap/types'
  import type { RenderGroup } from '../../gl/renderGroup'
  import type { RenderLayer } from '../../gl/renderLayer'
  import { AnyTilesLayer, GameLayer } from '../../twmap/tilesLayer'
  import { Image } from '../../twmap/image'
  import { onMount, onDestroy } from 'svelte'
  import { server, serverConfig, rmap, selected, automappers, anim, view, View, peers } from '../global'
  import { canvas } from '../../gl/global'
  import TreeView from './treeView.svelte'
  import { showInfo, showError, clearDialog } from './dialog'
  import EnvelopeEditor from './envelopeEditor.svelte'
  import * as Editor from './editor'
  import { externalImageUrl, px2vw, rem2px, queryImageData } from './util'
  import { Pane, Splitpanes } from 'svelte-splitpanes'
  import LayerEditor from './editLayer.svelte'
  import GroupEditor from './editGroup.svelte'
  import Viewport from './viewport.svelte'
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

  // let viewport: Viewport

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
  let activeRgroup: RenderGroup | null, activeRlayer: RenderLayer | null
  let activeGroup: Group | null, activeLayer: Layer | null
  $: ll = $selected.map(([_, l]) => l).filter(l => l !== -1 && $rmap.map.groups[g].layers[l].type === LayerType.TILES)
  $: activeRgroup = g === -1 ? null : $rmap.groups[g]
  $: activeRlayer = l === -1 ? null : activeRgroup.layers[l]
  $: activeGroup = activeRgroup === null ? null : activeRgroup.group
  $: activeLayer = activeRlayer === null ? null : activeRlayer.layer
  $: $rmap.setActiveLayer(activeRlayer)

  async function onCreateLayer(e: CreateLayer) {
    showInfo('Creating layer…')
    try {
      await $server.query('createlayer', e)
      serverOnCreateLayer(e)
      clearDialog()
    } catch (e) {
      showError('Failed to create layer: ' + e)
    }
  }
  async function onDeleteLayer(e: DeleteLayer) {
    showInfo('Deleting layer…')
    try {
      await $server.query('deletelayer', e)
      serverOnDeleteLayer(e)
      clearDialog()
    } catch (e) {
      showError('Failed to delete layer: ' + e)
    }
  }
  async function onEditLayer(e: EditLayer) {
    // showInfo('Please wait…')
    try {
      await $server.query('editlayer', e)
      serverOnEditLayer(e)
      clearDialog()
    } catch (e) {
      showError('Failed to edit layer: ' + e)
    }
  }
  async function onReorderLayer(e: ReorderLayer) {
    // showInfo('Please wait…')
    try {
      await $server.query('reorderlayer', e)
      serverOnReorderLayer(e)
      clearDialog()
    } catch (e) {
      showError('Failed to reorder layer: ' + e)
    }
  }
  async function onCreateGroup() {
    const e: CreateGroup = { name: '' }
    showInfo('Creating group…')
    try {
      await $server.query('creategroup', e)
      serverOnCreateGroup(e)
      $selected = [[$rmap.map.groups.length - 1, -1]]
      clearDialog()
    } catch (e) {
      showError('Failed to create group: ' + e)
    }
  }
  async function onDeleteGroup(e: DeleteGroup) {
    showInfo('Deleting group…')
    try {
      await $server.query('deletegroup', e)
      serverOnDeleteGroup(e)
      clearDialog()
    } catch (e) {
      showError('Failed to delete group: ' + e)
    }
  }
  async function onEditGroup(e: EditGroup) {
    // showInfo('Please wait…')
    try {
      await $server.query('editgroup', e)
      serverOnEditGroup(e)
      clearDialog()
    } catch (e) {
      showError('Failed to edit group: ' + e)
    }
  }
  async function onReorderGroup(e: ReorderGroup) {
    // showInfo('Please wait…')
    try {
      await $server.query('reordergroup', e)
      serverOnReorderGroup(e)
      clearDialog()
    } catch (e) {
      showError('Failed to reorder group: ' + e)
    }
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
  function serverOnUploadAutomapper(e: AutomapperConfigs) {
    $automappers[e.image] = e.configs
    $automappers = $automappers
  }
  function serverOnCreateQuad(e: CreateQuad) {
    $rmap.createQuad(e)
    activeLayer = activeLayer // hack to redraw quadview
  }
  function serverOnEditQuad(e: EditQuad) {
    $rmap.editQuad(e)
    activeLayer = activeLayer // hack to redraw quadview
  }
  function serverOnDeleteQuad(e: DeleteQuad) {
    $rmap.deleteQuad(e)
    activeLayer = activeLayer // hack to redraw quadview
  }
  function serverOnCreateEnvelope(e: CreateEnvelope) {
    $rmap.createEnvelope(e)
    $rmap = $rmap // hack to redraw env editor
  }
  function serverOnEditEnvelope(e: EditEnvelope) {
    $rmap.editEnvelope(e)
    $rmap = $rmap // hack to redraw env editor
  }
  function serverOnDeleteEnvelope(e: DeleteEnvelope) {
    $rmap.removeEnvelope(e.index)
    $rmap = $rmap // hack to redraw env editor
  }
  function serverOnEditGroup(e: EditGroup) {
    $rmap.editGroup(e)
    $rmap = $rmap // hack to redraw treeview
  }
  async function serverOnEditLayer(e: EditLayer) {
    $rmap.editLayer(e)
    $rmap = $rmap // hack to redraw treeview
  }
  function serverOnCreateGroup(e: CreateGroup) {
    $rmap.createGroup(e)
    $rmap = $rmap // hack to redraw treeview
  }
  function serverOnCreateLayer(e: CreateLayer) {
    $rmap.createLayer(e)
    $rmap = $rmap // hack to redraw treeview
  }
  function serverOnDeleteGroup(e: DeleteGroup) {
    $rmap.deleteGroup(e)
    $rmap = $rmap // hack to redraw treeview
    $selected = $selected.filter(([g, _]) => g !== e.group)
    if ($selected.length === 0)
      $selected = [[Math.min($rmap.map.groups.length - 1, e.group), -1]]
  }
  function serverOnDeleteLayer(e: DeleteLayer) {
    $rmap.deleteLayer(e)
    $rmap = $rmap // hack to redraw treeview
    $selected = $selected.filter(([g, l]) => g !== e.group || l !== e.layer)
    if ($selected.length === 0) {
      $selected = (activeGroup.layers.length === 0) ?
        [$rmap.map.physicsLayerIndex(GameLayer)] :
        [[g, Math.min(activeGroup.layers.length - 1, e.layer)]]
    }
  }
  function serverOnReorderGroup(e: ReorderGroup) {
    $rmap.reorderGroup(e)
    $rmap = $rmap // hack to redraw treeview
    $selected.pop() // remove active
    const active: [number, number] =
       activeLayer ? $rmap.map.layerIndex(activeLayer) :
       activeGroup ? [$rmap.map.groupIndex(activeGroup), -1] :
       $rmap.map.physicsLayerIndex(GameLayer)
      
    $selected = [...$selected, active]
  }
  function serverOnReorderLayer(e: ReorderLayer) {
    $rmap.reorderLayer(e)
    $rmap = $rmap // hack to redraw treeview
    $selected.pop() // remove active
    const active: [number, number] =
       activeLayer ? $rmap.map.layerIndex(activeLayer) :
       activeGroup ? [$rmap.map.groupIndex(activeGroup), -1] :
       $rmap.map.physicsLayerIndex(GameLayer)
    $selected = [...$selected, active]
  }
  async function serverOnCreateImage(e: CreateImage) {
    if (e.index !== $rmap.map.images.length)
      return
    if (e.external) {
      const image = new Image()
      image.loadExternal(externalImageUrl(e.name))
      image.name = e.name
      $rmap.addImage(image)
    } else {
      const image = new Image()
      image.name = e.name
      $rmap.addImage(image)
      const data = await queryImageData($serverConfig.httpUrl, $rmap.map.name, e.index)
      image.loadEmbedded(data)
    }
    $rmap = $rmap // hack to redraw treeview
  }
  function serverOnDeleteImage(e: DeleteImage) {
    $rmap.removeImage(e.index)
  }
  async function serverOnEditMap(e: EditMap) {
    $rmap.map.info = e.info
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

  onMount(() => {
    $selected = [$rmap.map.physicsLayerIndex(GameLayer)]
    $server.socket.addEventListener('close', onServerClosed, { once: true })
    $server.on('listusers', serverOnUsers)
    $server.on('edittile', serverOnEditTile)
    $server.on('edittiles', serverOnEditTiles)
    $server.on('applyautomapper', serverOnApplyAutomapper)
    $server.on('deleteautomapper', serverOnDeleteAutomapper)
    $server.on('uploadautomapper', serverOnUploadAutomapper)
    $server.on('createquad', serverOnCreateQuad)
    $server.on('editquad', serverOnEditQuad)
    $server.on('deletequad', serverOnDeleteQuad)
    $server.on('createenvelope', serverOnCreateEnvelope)
    $server.on('editenvelope', serverOnEditEnvelope)
    $server.on('deleteenvelope', serverOnDeleteEnvelope)
    $server.on('editlayer', serverOnEditLayer)
    $server.on('editgroup', serverOnEditGroup)
    $server.on('creategroup', serverOnCreateGroup)
    $server.on('createlayer', serverOnCreateLayer)
    $server.on('reordergroup', serverOnReorderGroup)
    $server.on('reorderlayer', serverOnReorderLayer)
    $server.on('deletegroup', serverOnDeleteGroup)
    $server.on('deletelayer', serverOnDeleteLayer)
    $server.on('createimage', serverOnCreateImage)
    $server.on('deleteimage', serverOnDeleteImage)
    $server.on('editmap', serverOnEditMap)
    $server.on('error', serverOnError)
    $server.send('listusers')

    canvas.addEventListener('mouseenter', onHoverCanvas)
  })

  onDestroy(() => {
    $server.socket.removeEventListener('error', onServerClosed)
    $server.off('listusers', serverOnUsers)
    $server.off('edittile', serverOnEditTile)
    $server.off('edittiles', serverOnEditTiles)
    $server.off('applyautomapper', serverOnApplyAutomapper)
    $server.off('deleteautomapper', serverOnDeleteAutomapper)
    $server.off('uploadautomapper', serverOnUploadAutomapper)
    $server.off('createquad', serverOnCreateQuad)
    $server.off('editquad', serverOnEditQuad)
    $server.off('deletequad', serverOnDeleteQuad)
    $server.off('createenvelope', serverOnCreateEnvelope)
    $server.off('editenvelope', serverOnEditEnvelope)
    $server.off('deleteenvelope', serverOnDeleteEnvelope)
    $server.off('editlayer', serverOnEditLayer)
    $server.off('editgroup', serverOnEditGroup)
    $server.off('creategroup', serverOnCreateGroup)
    $server.off('createlayer', serverOnCreateLayer)
    $server.off('reordergroup', serverOnReorderGroup)
    $server.off('reorderlayer', serverOnReorderLayer)
    $server.off('deletegroup', serverOnDeleteGroup)
    $server.off('deletelayer', serverOnDeleteLayer)
    $server.off('createimage', serverOnCreateImage)
    $server.off('deleteimage', serverOnDeleteImage)
    $server.off('editmap', serverOnEditMap)
    $server.off('error', serverOnError)

    canvas.removeEventListener('mouseenter', onHoverCanvas)
  })

  function onHoverCanvas() {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    canvas.focus()
  }

  function showLayers() {
    layerPaneSize = lastLayerPaneSize
    propsPaneSize = lastPropsPaneSize
  }

  function hideLayers() {
    lastLayerPaneSize = layerPaneSize
    lastPropsPaneSize = propsPaneSize
    layerPaneSize = 0
    propsPaneSize = 0
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
    if (!target.contains(canvas)) return

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
    if (!target.contains(canvas)) return

    Editor.fire('keyup', e)
  }

  function onKeyPress(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    if (!target.contains(canvas)) return

    Editor.fire('keypress', e)
  }


</script>

<svelte:window on:keydown={onKeyDown} on:keyup={onKeyUp} on:keypress={onKeyPress} />

<div id="editor">

  <Splitpanes horizontal id="panes" dblClickSplitter={false}>
    <Pane size={100 - envPaneSize}>
      <Splitpanes dblClickSplitter={false}>
        <Pane class="layers" bind:size={layerPaneSize}>
          <TreeView />
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
          <Viewport />
        </Pane>

        <Pane class="properties" bind:size={propsPaneSize}>
          {#if $selected.length > 1}
            <div class="edit-multiple">
              <h3 class="bx--modal-header__heading">Multiple selection</h3>
              {#if ll.length > 1}
                <span>You selected {ll.length} tile layers.</span>
                <span>You can edit the tiles from these layers together with your brush (clone, delete and repeat).</span>
              {:else}
                <span>You selected multiple layers.</span>
                <span>Editing quad layers together is not implemented yet. You can only edit tiles layers together.</span>
              {/if}
            </div>
          {:else if l !== -1}
            <LayerEditor
              on:deletelayer={e => onDeleteLayer(e.detail)}
              on:editlayer={e => onEditLayer(e.detail)}
              on:reorderlayer={e => onReorderLayer(e.detail)}
            />
          {:else if g !== -1}
            <GroupEditor
              on:createlayer={e => onCreateLayer(e.detail)}
              on:deletegroup={e => onDeleteGroup(e.detail)}
              on:editgroup={e => onEditGroup(e.detail)}
              on:reordergroup={e => onReorderGroup(e.detail)}
            />
          {:else}
            <span>Select a group or a layer in the left bar.</span>
          {/if}
        </Pane>
      </Splitpanes>
    </Pane>

    <Pane bind:size={envPaneSize}>
      <EnvelopeEditor />
    </Pane>
  </Splitpanes>

</div>
