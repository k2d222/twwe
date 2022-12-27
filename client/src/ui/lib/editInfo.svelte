<script lang="ts">
  import type { MapInfo } from '../../twmap/map'

  export let info: MapInfo

  function onChangeSettings(e: Event & { currentTarget: HTMLTextAreaElement }) {
    info.settings = e.currentTarget.value.split('\n').filter(s => s !== '')
  }
</script>

<div class="edit-info">
  <label
    >Author(s)
    <input type="text" bind:value={info.author} maxlength="31" />
  </label>
  <label
    >Version
    <input type="text" bind:value={info.version} maxlength="15" />
  </label>
  <label
    >Credits
    <input type="text" bind:value={info.credits} maxlength="127" />
  </label>
  <label
    >License
    <input type="text" bind:value={info.license} maxlength="31" />
  </label>
  <label
    >Server Settings
    <textarea
      rows="5"
      cols="50"
      value={info.settings.join('\n')}
      on:change={onChangeSettings}
      title="Server settings allow running commands on the server when the map is loaded."
    />
  </label>
</div>
