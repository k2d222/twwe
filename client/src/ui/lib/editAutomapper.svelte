<script lang="ts">
  import { onMount } from "svelte"
  import { automappers, server } from "../global"
  import { TrashCan as TrashIcon, Add as AddIcon } from "carbon-icons-svelte"
  import { showError, showInfo, showWarning } from "./dialog"
  import { Button } from 'carbon-components-svelte'
  import { createEventDispatcher } from 'svelte'

  import { basicSetup } from "codemirror"
  import { EditorState } from "@codemirror/state"
  import { EditorView } from "@codemirror/view"
  import { DDNetRules } from './lang-ddnet_rules/index'

  import {
    lint as lintAutomapper,
    LintLevel,
    lintToString,
  } from '../../twmap/automap'

  const dispatch = createEventDispatcher()

  let editor: HTMLElement
  let selected: string | null = null
  let changed = false
  let newAmName = ''
  let view: EditorView

  onMount(() => {
    const state = editorState('Select or create an automapper on the left panel.')
    view = new EditorView({
      state,
      parent: editor,
    })
  })

  function editorState(doc: string) {
    return EditorState.create({
      extensions: [basicSetup, DDNetRules()],
      doc
    })
  }

  async function onDelete(name: string) {
    const resp = await showWarning(`Do you want to delete '${name}'?`, 'yesno')

    if (resp) {
      await $server.query('deleteautomapper', name)
      delete $automappers[name]
      $automappers = $automappers
    }
  }

  async function onNew() {
    if (!isValidName(newAmName)) return

    const name = newAmName
    newAmName = ''
    await $server.query('uploadautomapper', {
      image: name,
      content: '',
    })

    $automappers[name] = []
    $automappers = $automappers
  }

  async function onSave() {
    if (selected === null) return

    const str = view.state.doc.toString()

    const lints = lintAutomapper(str)
    const errs = lints.filter(l => l.level === LintLevel.Error)

    for (const lint of lints) {
      await showError(lintToString(lint))
    }

    if (errs.length > 0) {
      const resp = await showWarning(`The automapper contains ${errs.length} error(s). Proceed?`, 'yesno')
      if (!resp) return
    }

    try {
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

    showInfo(
      `Uploaded ${$automappers[selected].length} rules for '${selected}'.`,
      'closable'
    )
    changed = false
  }

  function onClose() {
    dispatch('close')
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
  <div class="list">
    {#each Object.keys($automappers) as name}
      <div
        class="row"
        aria-selected={selected === name}
        class:selected={selected === name}
        tabindex="0"
        role="button"
        on:keydown={onKeydown}
        on:click={() => onSelect(name)}
      >
        <span class="label">{name}</span>
        <button on:click={() => onDelete(name)}><TrashIcon /></button>
      </div>
    {/each}

    <input type="text" bind:value={newAmName} class="default" maxlength={127} placeholder="New automapper name" />
    <Button
      size="field"
      kind="ghost"
      icon={AddIcon}
      on:click={onNew}
      disabled={!isValidName(newAmName)}
    >Create</Button>
  </div>

  <div class="right">
    <div class="editor hljs" bind:this={editor}></div>
    <div class="controls">
      <button class="default large" on:click={onClose}>Close</button>
      <button class="primary large" on:click={onSave} disabled={selected === null}>Save</button>
    </div>
  </div>
</div>
