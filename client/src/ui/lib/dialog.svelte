<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Modal, ToastNotification } from 'carbon-components-svelte'
  import { fly } from 'svelte/transition'
  import { flip } from 'svelte/animate'

  interface Message {
    type: 'info' | 'warning' | 'error'
    controls: 'closable' | 'yesno' | 'none'
    message: string
    id: number
  }

  export let messages: Message[] = []

  const dispatch = createEventDispatcher()

  function onClose(id: number) {
    dispatch('close', [id, false])
  }
  function onYes(id: number) {
    dispatch('close', [id, true])
  }
  function onNo(id: number) {
    dispatch('close', [id, false])
  }
</script>

<svelte:options accessors/>

<div id="dialog">
  {#each messages as { type, controls, message, id } (id)}
    <div class="notification"
      transition:fly|global={{ delay: 0, duration: 400, x: 200 }}
      animate:flip = {{ duration: 200 }}
    >
      {#if controls === 'yesno'}
          <Modal
            open
            modalHeading={message}
            primaryButtonText="Yes"
            secondaryButtonText="No"
            preventCloseOnClickOutside
            on:close={() => onNo(id)}
            on:submit={() => onYes(id)}
            on:click:button--secondary={() => onNo(id)}
          />
      {:else}
          <ToastNotification
            kind={type}
            title={message}
            on:close={() => onClose(id)}
            hideCloseButton={controls !== 'closable'}
          >
            <slot slot="caption"></slot>
          </ToastNotification>
      {/if}
    </div>
  {/each}
</div>
