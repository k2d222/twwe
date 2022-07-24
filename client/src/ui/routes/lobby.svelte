<script type="ts">
  import type { MapInfo } from '../../server/protocol'
  import Dialog from '../lib/dialog.svelte'
  import { navigate } from "svelte-routing"
  import { pServer } from '../global'
  import { showInfo, showWarning, showError, clearDialog } from '../lib/dialog'
  import Fuse from 'fuse.js';

  let selected: string
  let searchTerm: string = ''
  
  function sortMapInfos(mapInfos: MapInfo[]) {
    mapInfos.sort((a, b) => {
      if (a.users === b.users)
        return a.name.localeCompare(b.name)
      else
        return b.users - a.users
    })
  }

  function filterMaps() {
    if (!mapList) {
      return
    }
    if (searchTerm == '') {
      filteredMaps = mapList
      return
    }
    const fuse = new Fuse(mapList, {
      keys: ['name']
    })
    filteredMaps = fuse.search(searchTerm).map(map => map.item)
  }

  function updateSearch(e: Event & { currentTarget: HTMLInputElement }) {
    searchTerm = e.currentTarget.value
    if (!mapList) {
      return
    }
    filterMaps()
    if (filteredMaps.length > 0) {
      selected = filteredMaps[0].name
    }
  }

  async function refresh() {
    showInfo("Updating maps infos…", 'none')
    const server = await pServer
    let { maps } = await server.query('listmaps', null)
    sortMapInfos(maps)
    filteredMaps = mapList = maps
    if (filteredMaps.length > 0) {
      selected = filteredMaps[0].name
    }
    clearDialog()
  }

  let mapList = null
  let filteredMaps = null
  refresh()

  async function onDelete() {
    const server = await pServer
    const res = await showWarning('Are you sure you want to delete "' + selected + '"?', 'yesno')
    
    if (res) {
      showInfo('Deleting map…', 'none')
      try {
        await server.query('deletemap', { name: selected })
          clearDialog()
          refresh()
      }
      catch (e) {
        showError('Map deletion failed: ' + e)
      }
    }
  }

  function updateSelection(offset: number) {
    const options = document.querySelectorAll('input')
    let currentIndex = 0
    let counter = 0
    options.forEach((option) => {
      if (option.checked) {
        currentIndex = counter
      }
      counter++
    })
    const nextOption = currentIndex + offset
    if (nextOption >= 0 && nextOption < options.length) {
      options[currentIndex].checked = false
      options[nextOption].checked = true
      selected = options[nextOption].value
    }
  }

  function onload(element: HTMLElement) {
    // auto focus search box on page load
    element.focus()
    element.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        updateSelection(1)
      } else if (event.key === 'ArrowUp') {
        updateSelection(-1)
      } else if (event.key === 'Enter') {
        navigate('/edit/' + selected)
      }
    })
  }

</script>

{#if !filteredMaps}
  <Dialog>Fetching maps infos…</Dialog>
{:else}
  <div id="lobby">
    <div class="content">
      <h2>Join Room</h2>
      <div class="header row">
        <span></span>
        <span>Map Name</span>
        <span>Users</span>
      </div>

      <div class="list">
        {#each filteredMaps as info}
          <div class="row">
            <input type="radio" name="map" bind:group={selected} value={info.name} />
            <span class="name">{info.name}</span>
            <span class="users">{info.users}</span>
          </div>
        {/each}
      </div>

      <div id="join-map" class="buttons right">
        <button class="refresh" on:click={refresh}><img src="/assets/refresh.svg" alt="refresh"/></button>
        <button class="create" on:click={() => navigate('/create/')}>New…</button>
        <button class="delete" on:click={onDelete}><img src="/assets/trash.svg" alt="delete"/></button>
        <button class="join" on:click={() => navigate('/edit/' + selected)}>Join</button>
        <input on:input={updateSearch} value="{searchTerm}" type="text" name="search" id="search" placeholder="search" use:onload>
      </div>
    </div>
  </div>
{/if}
