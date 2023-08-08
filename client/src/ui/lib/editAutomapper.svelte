<script lang="ts" context="module">
  import hljs from 'highlight.js/lib/core';
  import 'highlight.js/styles/github.css'
  import lang_rules from './hljs-rules';

  hljs.registerLanguage("rules", lang_rules);
</script>

<script lang="ts">
  import { onMount } from "svelte"
  import { automappers, server } from "../global"
  import { CodeJar } from "codejar"
  import { TrashCan as TrashIcon, Add as AddIcon, DistributeHorizontalLeft } from "carbon-icons-svelte"
  import { showDialog, showError, showWarning } from "./dialog"
  import { Button } from 'carbon-components-svelte'
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher()

  let editor: HTMLElement
  let selected: string | null = null
  let jar: CodeJar
  let newAmName = ''

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
    try {
      const resp = await $server.query('uploadautomapper', {
        image: selected,
        content: jar.toString()
      })
      $automappers[resp.image] = resp.configs
      $automappers = $automappers
    }
    catch (e) {
      showError("Saving failed: " + e)
    }
  }

  function onClose() {
    dispatch('close')
  }

  async function onSelect(image: string) {
    selected = image
    const text = await $server.query('sendautomapper', image)
    jar.updateCode(text)
  }

  function onKeydown(_e: KeyboardEvent) {
    
  }

  function highlight() {
    let code = editor.textContent
    code = hljs.highlight(code, { language: 'rules' }).value;
    editor.innerHTML = code
  }

  function isValidName(name: string) {
    return name !== '' && !Object.keys($automappers).includes(name)
  }

  onMount(() => {
    jar = CodeJar(editor, highlight)
  })

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
    <div class="editor hljs" bind:this={editor}>Select or create an automapper on the left panel.</div>
    <div class="controls">
      <button class="default large" on:click={onClose}>Close</button>
      <button class="primary large" on:click={onSave} disabled={selected === null}>Save</button>
    </div>
  </div>
</div>
