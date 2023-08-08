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
  import { TrashCan as TrashIcon, Add as AddIcon } from "carbon-icons-svelte"
  import { showDialog, showWarning } from "./dialog"
  import { Button } from 'carbon-components-svelte'

  let editor: HTMLElement
  let selected: string | null = null
  let jar: CodeJar

  async function onDelete(name: string) {
    const resp = await showWarning(`Do you want to delete '${name}'?`, 'yesno')
    if (resp) {
      delete $automappers[name]
      $automappers = $automappers
    }
  }
  function onNew() {
    
  }
  function onSave() {
    
  }
  async function onSelect(image: string) {
    selected = image
    const text = await $server.query('sendautomapper', { image })
    jar.updateCode(text)
  }
  function onKeydown(e: KeyboardEvent) {
    
  }

  function highlight() {
    let code = editor.textContent
    code = hljs.highlight(code, { language: 'rules' }).value;
    editor.innerHTML = code
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
    <Button
      size="field"
      kind="ghost"
      icon={AddIcon}
      on:click={onNew}
    >New automapper</Button>
  </div>
  <div class="right">
    <div class="editor hljs" bind:this={editor}></div>
    <div class="controls">
      <button class="default large" on:click={onSave}>Close</button>
      <button class="primary large" on:click={onSave}>Save</button>
    </div>
  </div>
</div>
