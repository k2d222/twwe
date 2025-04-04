<script lang="ts">
  import {
    Layers as LayersIcon,
    // Activity as EnvelopesIcon,
    Save as SaveIcon,
    Play as PlayIcon,
    Pause as PauseIcon,
    Image as ImagesIcon,
    Music as SoundsIcon,
    Code as AutomapperIcon,
    Share as ShareIcon,
  } from 'carbon-icons-svelte'
  import {
    OverflowMenu,
    OverflowMenuItem,
    ComposedModal,
    ModalBody,
    ModalHeader,
  } from 'carbon-components-svelte'
  import { peers, map, anim, view, View } from '../global'
  import * as Actions from '../actions'
  import InfoEditor from './editInfo.svelte'
  import SharingEditor from './editSharing.svelte'
  import TeesIcon from '../../../assets/ddnet/tees_symbolic.svg?component'

  let infoEditorVisible = false
  let shareVisible = false

  function onToggleLayers() {
    $view = View.Layers
  }

  // function onToggleEnvelopes() {
  //   $view = View.Envelopes
  // }

  function onToggleImages() {
    $view = View.Images
  }

  function onToggleAutomappers() {
    $view = View.Automappers
  }

  function onSaveMap() {
    Actions.saveMap()
  }

  function onToggleAnim() {
    $anim = !$anim
  }

  function onEditInfo() {
    infoEditorVisible = !infoEditorVisible
  }

  function onRenameMap() {
    alert('TODO renaming maps is not implemented yet.')
  }

  function onDownloadMap() {
    Actions.downloadMap()
  }

  async function onLeaveMap() {
    Actions.goToLobby()
  }

  function onDeleteMap() {
    Actions.deleteMap()
  }

  function onShareMap() {
    shareVisible = true
  }
</script>

<div id="header">
  <div class="left">
    <button
      class="header-btn"
      class:selected={$view === View.Layers}
      id="nav-toggle"
      on:click={onToggleLayers}
    >
      <LayersIcon size={20} title="Layers" />
    </button>
    <!--
    <button class="header-btn" id="env-toggle" on:click={onToggleEnvelopes}>
      <EnvelopesIcon size={20} title="Envelopes" />
    </button>
    -->
    <button
      class="header-btn"
      class:selected={$view === View.Images}
      id="images-toggle"
      on:click={onToggleImages}
      disabled
    >
      <ImagesIcon size={20} title="Images (TODO)" />
    </button>
    <button class="header-btn" class:selected={$view === View.Sounds} id="sounds-toggle" disabled>
      <SoundsIcon size={20} title="Sounds (TODO)" />
    </button>
    <button
      class="header-btn"
      class:selected={$view === View.Automappers}
      id="automappers-toggle"
      on:click={onToggleAutomappers}
    >
      <AutomapperIcon size={20} title="Automappers" />
    </button>

    <div class="separator"></div>

    <button class="header-btn" id="save" on:click={onSaveMap}>
      <SaveIcon size={20} title="Save map on server" />
    </button>
    <button class="header-btn" id="anim-toggle" on:click={onToggleAnim}>
      <svelte:component
        this={$anim ? PauseIcon : PlayIcon}
        size={20}
        title="Play/Pause envelopes animations"
      />
    </button>
    <OverflowMenu class="header-btn" iconDescription="Map settings">
      <OverflowMenuItem text="Properties" hasDivider on:click={onEditInfo} />
      <OverflowMenuItem text="Rename" on:click={onRenameMap} />
      <OverflowMenuItem text="Download" on:click={onDownloadMap} />
      <OverflowMenuItem text="Leave" on:click={onLeaveMap} />
      <OverflowMenuItem danger text="Delete" hasDivider on:click={onDeleteMap} />
    </OverflowMenu>
  </div>
  <div class="middle">
    <div class="text-overflow"><span id="map-name">{$map.name}</span></div>
  </div>
  <div class="right">
    <div id="users">
      <TeesIcon />
      <span>{$peers}</span>
    </div>
    {#if '__TAURI__' in window || import.meta.env.MODE === 'development'}
      <button class="header-btn" id="share-btn" on:click={onShareMap}>
        <ShareIcon size={20} title="Share" />
      </button>
    {/if}
  </div>

  <ComposedModal
    open={infoEditorVisible}
    on:close={() => (infoEditorVisible = false)}
    selectorPrimaryFocus=".bx--modal-close"
  >
    <ModalHeader title="Map Properties" />
    <ModalBody hasForm>
      <InfoEditor />
    </ModalBody>
  </ComposedModal>

  <ComposedModal
    size="sm"
    open={shareVisible}
    on:close={() => (shareVisible = false)}
    selectorPrimaryFocus=".bx--modal-close"
  >
    <ModalHeader title="Sharing options" />
    <ModalBody hasForm>
      <SharingEditor />
    </ModalBody>
  </ComposedModal>
</div>
