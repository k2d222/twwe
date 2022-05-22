<script>
	import Dialog from './dialog.svelte'
	import { navigate } from "svelte-routing"

  export let server

	let selected
	let pMapInfos
	
	function sortMapInfos(mapInfos) {
		mapInfos.sort((a, b) => {
      if (a.users === b.users)
        return a.name.localeCompare(b.name)
      else
        return b.users - a.users
    })
	}
		
	function refresh() {
		pMapInfos = server.query('maps')
		.then(mapInfos => {
			sortMapInfos(mapInfos)
			selected = mapInfos[0].name
			console.log(mapInfos, selected)
			return mapInfos
		})
	}

	refresh()
</script>

{#await pMapInfos}
	<Dialog>Fetching maps infos…</Dialog>
{:then mapInfos}
	<div id="lobby">
		<div class="content">
			<h2>Available maps</h2>
			<div class="header row">
				<span></span>
				<span>Map Name</span>
				<span>Users</span>
			</div>

			<div class="list">
	      {#each mapInfos as info, i}
	        <div class="row">
	          <input type="radio" name="map" bind:group={selected} value={info.name} />
	          <span class="name">{info.name}</span>
	          <span class="users">{info.users}</span>
	        </div>
	      {/each}
	    </div>

			<div class="buttons">
				<button class="refresh" on:click={refresh}><img src="refresh.svg" alt="refresh"/></button>
				<button class="join" on:click={() => navigate('/edit/' + selected)}>Join</button>
			</div>
		</div>
	</div>
{:catch e}
	<Dialog>Failed to query maps.</Dialog>
{/await}
