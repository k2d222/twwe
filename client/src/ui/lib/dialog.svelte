<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import Info from '../../../assets/color-info.svg?component'
  import Warning from '../../../assets/color-warning.svg?component'
  import Error from '../../../assets/color-error.svg?component'
  import { Modal, ModalHeader, ToastNotification } from 'carbon-components-svelte'

  export let type: 'info' | 'warning' | 'error' = 'info'
  export let controls: 'closable' | 'yesno' | 'none' = 'none'
  export let message = ''

  const dispatch = createEventDispatcher()

  function onClose() {
    dispatch('close')
  }
  function onYes() {
    dispatch('close', true)
  }
  function onNo() {
    dispatch('close', false)
  }
</script>


<div id="dialog" class={type}>
  {#if controls === 'yesno'}
    <Modal
      modalHeading={message}
      primaryButtonText="Yes"
      secondaryButtonText="No"
      danger
      preventCloseOnClickOutside
      on:close={onNo}
      on:submit={onYes}
    />
  {:else}
    <ToastNotification
      kind={type}
      title={message}
      on:close={onClose}
      hideCloseButton={controls !== 'closable'}
    >
      <slot slot="caption"></slot>
    </ToastNotification>
  {/if}
</div>

