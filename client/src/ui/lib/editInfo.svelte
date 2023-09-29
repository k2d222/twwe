<script lang="ts">
  import { sync } from '../../server/util'
  import { server, map } from '../global'


  $: syncInfo = sync($server, $map.info, { query: 'map/edit/info' }) 

  function onChangeSettings(e: Event & { currentTarget: HTMLTextAreaElement }) {
    $syncInfo.settings = e.currentTarget.value.split('\n').filter(s => s !== '')
    onChange()
  }

  function onChange() {
    $syncInfo = { ...$syncInfo }
  }
</script>

<div class="edit-info">
  <label>
    Author(s)
    <input type="text" on:change={onChange} bind:value={$syncInfo.author} maxlength="31" />
  </label>
  <label>
    Version
    <input type="text" on:change={onChange} bind:value={$syncInfo.version} maxlength="15" />
  </label>
  <label>
    Credits
    <input type="text" on:change={onChange} bind:value={$syncInfo.credits} maxlength="127" />
  </label>
  <label>
    License
    <input type="text" on:change={onChange} bind:value={$syncInfo.license} maxlength="31" />
  </label>
  <label>
    Server Settings
    <textarea
      rows="5"
      cols="50"
      value={$syncInfo.settings.join('\n')}
      on:change={onChangeSettings}
      title="Server settings allow running commands on the server when the map is loaded."
    />
  </label>
</div>
