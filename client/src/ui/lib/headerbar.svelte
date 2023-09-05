<script lang="ts">
  import {
    Layers as LayersIcon,
    Activity as EnvelopesIcon,
    Save as SaveIcon,
    Play as PlayIcon,
    Pause as PauseIcon,
    Image as ImagesIcon,
    Music as SoundsIcon,
    Code as AutomapperIcon,
  } from 'carbon-icons-svelte'
  import {
    OverflowMenu,
    OverflowMenuItem,
    ComposedModal,
    ModalBody,
    ModalHeader,
  } from 'carbon-components-svelte'
  import { peers, rmap, anim, view, View } from '../global'
  import * as Actions from '../actions'
  import InfoEditor from './editInfo.svelte'

  let infoEditorVisible = false

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

  async function onInfoClose() {
    infoEditorVisible = false
    Actions.saveInfo()
  }

  function onRenameMap() {
    alert("TODO renaming maps is not implemented yet.")
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
</script>

<div id="header">
  <div class="left">
    <button class="header-btn" class:selected={$view === View.Layers} id="nav-toggle" on:click={onToggleLayers}>
      <LayersIcon size={20} title="Layers" />
    </button>
    <!--
    <button class="header-btn" id="env-toggle" on:click={onToggleEnvelopes}>
      <EnvelopesIcon size={20} title="Envelopes" />
    </button>
    -->
    <button class="header-btn" class:selected={$view === View.Images} id="images-toggle" on:click={onToggleImages} disabled>
      <ImagesIcon size={20} title="Images (TODO)" />
    </button>
    <button class="header-btn" class:selected={$view === View.Sounds} id="sounds-toggle" disabled>
      <SoundsIcon size={20} title="Sounds (TODO)" />
    </button>
    <button class="header-btn" class:selected={$view === View.Automappers} id="automappers-toggle" on:click={onToggleAutomappers}>
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
    <span id="map-name">{$rmap.map.name}</span>
  </div>
  <div class="right">
    <div id="users">
      Users online: <span>{$peers}</span>
    </div>
  </div>

  <ComposedModal
    open={infoEditorVisible}
    on:close={onInfoClose}
    selectorPrimaryFocus=".bx--modal-close"
  >
    <ModalHeader title="Map Properties" />
    <ModalBody hasForm>
      <InfoEditor info={$rmap.map.info} />
    </ModalBody>
  </ComposedModal>

</div>