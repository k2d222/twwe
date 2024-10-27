<script lang="ts" generics="T">
  import { InlineNotification, Loading } from 'carbon-components-svelte'
  import { showError } from './dialog'

  export let signal: Promise<T>
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
{:then result}
  <slot {result} />
{:catch error}
  {showError(error) && ''}
  <InlineNotification kind="error" hideCloseButton title={errorText} subtitle={error} />
{/await}
