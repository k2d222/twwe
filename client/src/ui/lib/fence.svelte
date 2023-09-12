<script lang="ts">
  import { InlineNotification, Loading } from 'carbon-components-svelte'

  export let signal: Promise<unknown>
  export let loadText = 'Loading'
  export let errorText = 'Error'
  export let fullscreen = false
</script>

{#await signal}
  <div class="loading" class:fullscreen>
    <div class="content">
      <Loading description={loadText} withOverlay={fullscreen} />
      <div class="text">{loadText}</div>
    </div>
  </div>
{:then}
  <slot />
{:catch error}
  <InlineNotification
    kind="error"
    hideCloseButton
    title={errorText}
    subtitle={error}
  />
{/await}
