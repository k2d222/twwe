<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import { automappers, server, map } from "../global"
  import { TrashCan as TrashIcon, Add as AddIcon } from "carbon-icons-svelte"
  import { clearDialog, showError, showInfo, showWarning } from "./dialog"
  import { Button, ComposedModal, ModalBody, ModalHeader } from 'carbon-components-svelte'
  import { Pane, Splitpanes } from "svelte-splitpanes"
  import MapView from "./mapView.svelte"
  import { px2vw, rem2px } from "./util"
  import DDNetIcon from "../../../assets/ddnet/ddnet_symbolic.svg?component"
  import RppIcon from "../../../assets/rpp/rpp_symbolic.svg?component"
  import { Unknown as UnknownIcon } from 'carbon-icons-svelte'
  import type { RenderMap } from "../../gl/renderMap"
  import { TilesLayer } from "../../twmap/tilesLayer"
  import { automap, parse } from "../../twmap/automap"

  import { basicSetup } from "codemirror"
  import { EditorState } from "@codemirror/state"
  import { EditorView, tooltips, keymap } from "@codemirror/view"
  import { DDNetRules } from './lang-ddnet_rules/index'
  import { DDNetRulesLinter } from "./lang-ddnet_rules/lint"
  import { Rpp } from './lang-rpp/index'
  import type { Tile } from "../../twmap/types"
  import { AutomapperKind, type Send } from "../../server/protocol"

  let editor: HTMLElement
  let selected: string | null = null
  let changed = false
  let newAmName = ''
  let newAmKind = AutomapperKind.DDNet
  let view: EditorView
  let emptyState = editorState('Select or create an automapper on the left panel.')
  let mapView: MapView
  let rmap: RenderMap
  let tilesCache: [number, number, Tile[]][] = []

  let createAmOpen = false

  onMount(() => {
    view = new EditorView({
      state: emptyState,
      parent: editor,
    })

    rmap = mapView.getRenderMap()

    $server.on('create/automapper', onUploadAutomapper)
    $server.on('delete/automapper', onDeleteAutomapper)
  })

  onDestroy(() => {
    // restore preview layers
    for (const [g, l, tiles] of tilesCache) {
      let layer = $map.groups[g].layers[l] as TilesLayer
      layer.tiles = tiles
    }

    $server.off('create/automapper', onUploadAutomapper)
    $server.off('delete/automapper', onDeleteAutomapper)
  })

  function onUploadAutomapper([name, file]: Send['create/automapper']) {
    const kind = name.slice(name.lastIndexOf('.') + 1) as AutomapperKind
    const image = name.slice(0, name.lastIndexOf('.'))
    $automappers[name] = { name, image, kind, file }
    $automappers = $automappers
  }

  function onDeleteAutomapper(name: Send['delete/automapper']) {
    delete $automappers[name]
    $automappers = $automappers
  }

  function editorState(doc: string, kind?: AutomapperKind) {
    let extensions = [
      basicSetup,
      keymap.of([
        { key: 'Ctrl-s', run: () => { onSave(); return true; } },
        { key: 'Ctrl-p', run: () => { onPreview(); return true; } },
      ]),
      // EditorView.lineWrapping, // This is a bit too laggy
      tooltips({ position: 'absolute' }), // This is a bit too laggy
      EditorView.updateListener.of(e => { if (e.docChanged) changed = true })
    ]

    if (kind === AutomapperKind.DDNet) {
      extensions.push(DDNetRules(), DDNetRulesLinter)
    }
    else if (kind === AutomapperKind.RulesPP) {
      extensions.push(Rpp())
    }

    return EditorState.create({ extensions, doc })
  }

  async function onDelete(file: string) {
    const resp = await showWarning(`Do you want to delete '${file}'?`, 'yesno')
    let sel = selected

    if (resp) {
      await $server.query('delete/automapper', file)

      if (file === sel) {
        selected = null
        view.setState(emptyState)
      }
    }
  }

  async function onNew() {
    if (changed) {
      const resp = await showWarning('Discard changes?', 'yesno')
      if (!resp) return
    }

    createAmOpen = true
  }

  async function onCreate() {
    if (!isValidName(newAmName)) return

    const name = `${newAmName}.${newAmKind}`
    const file = ''

    newAmName = ''

    await $server.query('create/automapper', [name, file])
    createAmOpen = false
  }

  async function onSave() {
    if (selected === null) return

    const file = view.state.doc.toString()

    const id = showInfo('Uploading...', 'none')
    try {
      const name = $automappers[selected].name
      await $server.query('create/automapper', [name, file])
    }
    finally {
      clearDialog(id)
    }

    changed = false
  }

  async function onPreview() {
    if (selected === null)
      return

    let am = $automappers[selected]

    if (am.kind !== AutomapperKind.DDNet) {
      showError('Cannot preview non-ddnet automapper yet.')
      return
    }

    let configs = parse(view.state.doc.toString())

    // restore preview layers
    for (const [g, l, tiles] of tilesCache) {
      let layer = $map.groups[g].layers[l] as TilesLayer
      layer.tiles = tiles
      rmap.groups[g].layers[l].recompute()
    }
    tilesCache = []

    if (configs === null || configs.length === 0) {
      showError('Cannot preview: the current automapper has no config.')
      return
    }

    $map.groups.forEach((group, g) => {
      group.layers.forEach((layer, l) => {
        if (
          layer instanceof TilesLayer &&
          layer.image &&
          layer.image.name === am.image &&
          layer.automapper.config !== -1 &&
          layer.automapper.config < configs.length
        ) {
          tilesCache.push([g, l, layer.tiles.slice()])
          let config = configs[layer.automapper.config]
          automap(layer, config, layer.automapper.seed)
          rmap.groups[g].layers[l].recompute()
        }
      })
    })

    if (tilesCache.length === 0) {
      let confs = configs.map(c => `'${c.name}'`).join(', ')
      showError(`Cannot preview: no layer uses image '${am.image}' with one of the automapper configs: ${confs}.`)
    }
  }

  async function onSelect(file: string) {
    if (file === selected) return

    const am = $automappers[file]

    if (changed) {
      const resp = await showWarning('Discard changes?', 'yesno')
      if (!resp) return
    }

    selected = file
    view.setState(editorState('Loading file...'))
    const text = await $server.query('get/automapper', file)
    view.setState(editorState(text, am.kind))
    changed = false
  }

  function onKeydown(_e: KeyboardEvent) {
    
  }

  function isValidName(name: string) {
    return name !== '' && !Object.keys($automappers).includes(name)
  }

  function automapperIcon(kind: AutomapperKind) {
      if (kind === AutomapperKind.DDNet) return DDNetIcon
      else if (kind === AutomapperKind.RulesPP) return RppIcon
      else return UnknownIcon
  }

</script>

<div id="edit-automapper">
  <Splitpanes id="panes" dblClickSplitter={false}>

    <Pane size={px2vw(rem2px(15))}>
      <div class="left list">
        {#each Object.entries($automappers).sort(([f1], [f2]) => f1.localeCompare(f2)) as [file, am]}
          <div
            class="row"
            aria-selected={selected === file}
            class:selected={selected === file}
            tabindex="0"
            role="tab"
            on:keydown={onKeydown}
            on:click={() => onSelect(file)}
          >
            <span class="icon"><svelte:component this={automapperIcon(am.kind)} /></span>
            <span class="label">{am.image}</span>
            <button on:click={() => onDelete(file)}><TrashIcon /></button>
          </div>
        {/each}

        <Button
          style="width: 100%; max-width: unset;"
          size="field"
          kind="ghost"
          icon={AddIcon}
          on:click={onNew}
        >New automapper</Button>
      </div>
    </Pane>

  <Pane>
    <div class="middle">
      <div class="controls">
        <span class:modified={changed}>{changed ? '*' : ''}{selected ?? ''}</span>
        <Button size="small" on:click={onSave} disabled={selected === null}>Save</Button>
        <Button size="small" on:click={onPreview} disabled={selected === null} kind="secondary">Preview</Button>
      </div>
      <div class="editor" bind:this={editor}></div>
    </div>
  </Pane>

  <Pane>
    <div class="right">
      <MapView bind:this={mapView} map={$map}/>
    </div>
  </Pane>

  </Splitpanes>
</div>

<ComposedModal bind:open={createAmOpen} size="sm" selectorPrimaryFocus=".bx--modal-close">
  <ModalHeader title="New automapper" />
  <ModalBody hasForm>
    <div class="new-automapper">
      <label>
        Name
        <input type="text" bind:value={newAmName} class="default" maxlength={127} placeholder="New automapper name" />
      </label>
      <label>
        Kind
        <select bind:value={newAmKind}>
          <option value={AutomapperKind.DDNet}>DDNet</option>
          <option value={AutomapperKind.RulesPP}>Rules++</option>
          <option value={AutomapperKind.Teeworlds} disabled>Teeworlds (TODO)</option>
        </select>
      </label>
      <button class="primary large" disabled={!isValidName(newAmName)} on:click={onCreate}>Create</button>
    </div>
  </ModalBody>
</ComposedModal>
