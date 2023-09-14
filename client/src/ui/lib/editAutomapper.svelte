<script lang="ts">
  import { onMount } from "svelte"
  import { automappers, server, rmap } from "../global"
  import { TrashCan as TrashIcon, Add as AddIcon } from "carbon-icons-svelte"
  import { clearDialog, showError, showInfo, showWarning } from "./dialog"
  import { Button, ComposedModal, ModalBody, ModalHeader } from 'carbon-components-svelte'

  import { basicSetup } from "codemirror"
  import { EditorState } from "@codemirror/state"
  import { EditorView, tooltips } from "@codemirror/view"
  import { DDNetRules } from './lang-ddnet_rules/index'
  import { DDNetRulesLinter } from "./lang-ddnet_rules/lint"
  import { Rpp } from './lang-rpp/index'
  import { Pane, Splitpanes } from "svelte-splitpanes"
  import MapView from "./mapView.svelte"
  import { px2vw, rem2px } from "./util"

  let editor: HTMLElement
  let selected: string | null = null
  let changed = false
  let newAmName = ''
  let view: EditorView
  let emptyState = editorState('Select or create an automapper on the left panel.')

  let createAmOpen = false

  onMount(() => {
    view = new EditorView({
      state: emptyState,
      parent: editor,
    })

    const ams = Object.keys($automappers)
    if (ams.length)
      onSelect(ams[0])
  })

  function editorState(doc: string) {
    return EditorState.create({
      extensions: [
        basicSetup,
        DDNetRules(),
        DDNetRulesLinter,
        // EditorView.lineWrapping, // This is a bit too laggy
        tooltips({ position: 'absolute' }), // This is a bit too laggy
        EditorView.updateListener.of(e => { if (e.docChanged) changed = true })
      ],
      doc
    })
  }

  async function onDelete(name: string) {
    const resp = await showWarning(`Do you want to delete '${name}'?`, 'yesno')
    let sel = selected

    if (resp) {
      await $server.query('deleteautomapper', name)
      delete $automappers[name]
      $automappers = $automappers

      if (name === sel) {
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

    const name = newAmName
    newAmName = ''

    try {
      await $server.query('uploadautomapper', {
        image: name,
        content: '',
      })

      $automappers[name] = []
      $automappers = $automappers
      createAmOpen = false
    }
    catch (e) {
      showError('Failed to create automapper: ' + e)
    }
  }

  async function onSave() {
    if (selected === null) return

    const str = view.state.doc.toString()

    try {
      showInfo("Uploading...")
      const resp = await $server.query('uploadautomapper', {
        image: selected,
        content: str
      })

      $automappers[resp.image] = resp.configs
      $automappers = $automappers
    }
    catch (e) {
      showError("Saving failed: " + e)
      return
    }

    clearDialog()
    changed = false
  }

  async function onSelect(image: string) {
    if (image === selected) return
    if (changed) {
      const resp = await showWarning('Discard changes?', 'yesno')
      if (!resp) return
    }

    selected = image
    view.setState(editorState('Loading file...'))
    const text = await $server.query('sendautomapper', image)
    view.setState(editorState(text))
    changed = false
  }

  function onKeydown(_e: KeyboardEvent) {
    
  }

  function isValidName(name: string) {
    return name !== '' && !Object.keys($automappers).includes(name)
  }

</script>

<div id="edit-automapper">
  <Splitpanes id="panes" dblClickSplitter={false}>

    <Pane size={px2vw(rem2px(15))}>
      <div class="left list">
        {#each Object.keys($automappers) as name}
          <div
            class="row"
            aria-selected={selected === name}
            class:selected={selected === name}
            tabindex="0"
            role="tab"
            on:keydown={onKeydown}
            on:click={() => onSelect(name)}
          >
            <span class="label">{name}</span>
            <button on:click={() => onDelete(name)}><TrashIcon /></button>
          </div>
        {/each}

        <Button
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
      </div>
      <div class="editor" bind:this={editor}></div>
    </div>
  </Pane>

  <Pane>
    <div class="right">
      <MapView map={$rmap.map}/>
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
        <select>
          <option selected value="ddnet">DDNet</option>
          <option value="rpp">Rules++</option>
          <option value="tw" disabled>Teeworlds 0.7 (TODO)</option>
        </select>
      </label>
      <button class="primary large" disabled={!isValidName(newAmName)} on:click={onCreate}>Create</button>
    </div>
  </ModalBody>
</ComposedModal>
