<script type="ts">
	import type { MapInfo } from '../../server/protocol'
	import Dialog from '../lib/dialog.svelte'
	import { navigate } from "svelte-routing"
	import { pServer } from '../global'
	import { showInfo, showWarning, showError, clearDialog } from '../lib/dialog'

	let selected: string
	
	function sortMapInfos(mapInfos: MapInfo[]) {
		mapInfos.sort((a, b) => {
      if (a.users === b.users)
        return a.name.localeCompare(b.name)
      else
        return b.users - a.users
    })
	}
		
	async function refresh() {
		showInfo("Updating maps infos…", 'none')
		const server = await pServer
		let mapInfos = await server.query('maps')
		sortMapInfos(mapInfos)
		selected = mapInfos[0].name
		clearDialog();
		return mapInfos
	}

	let pMapInfos = refresh()

	async function onDelete() {
		const server = await pServer
		const res = await showWarning('Are you sure you want to delete "' + selected + '"?', 'yesno')
		
		const onRefused = (err: string) => {
			showError('Map deletion failed: ' + err)
		}

		if (res) {
			showInfo('Deleting map…', 'none')
			// COMBAK: this is ugly, need to refactor server error handling globally
			server.on('refused', onRefused)
			const success = await server.query('deletemap', selected)
			server.off('refused', onRefused)
			if (success) {
				clearDialog()
				pMapInfos = refresh()
			}
		}
	}

</script>

{#await pMapInfos}
	<Dialog>Fetching maps infos…</Dialog>
{:then mapInfos}
	<div id="lobby">
		<div class="content">
			<h2>Join Room</h2>
			<div class="header row">
				<span></span>
				<span>Map Name</span>
				<span>Users</span>
			</div>

			<div class="list">
	      {#each mapInfos as info}
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
			</div>
		</div>
	</div>
{:catch e}
	{console.error(e)}
	<Dialog type="error">Failed to query maps.</Dialog>
{/await}
