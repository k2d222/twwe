<script lang="ts">
  import type { Image } from '../../twmap/image'
  import { createEventDispatcher } from 'svelte'
  import { FileUploader, Tab, TabContent, Tabs } from 'carbon-components-svelte'

  export let images: Image[] = []
  export let image: Image | null = null

  const externalImages = {
    basic_freeze: {
      size: { w: 1024, h: 1024 },
      versions: [],
    },
    bg_cloud1: {
      size: { w: 2048, h: 1024 },
      versions: ['ddnet06'],
    },
    bg_cloud2: {
      size: { w: 2048, h: 1024 },
      versions: ['ddnet06'],
    },
    bg_cloud3: {
      size: { w: 1024, h: 512 },
      versions: ['ddnet06'],
    },
    ddmax_freeze: {
      size: { w: 1024, h: 1024 },
      versions: [],
    },
    ddnet_start: {
      size: { w: 512, h: 135 },
      versions: [],
    },
    ddnet_tiles: {
      size: { w: 1024, h: 1024 },
      versions: [],
    },
    ddnet_walls: {
      size: { w: 1024, h: 1024 },
      versions: [],
    },
    desert_background: {
      size: { w: 1270, h: 416 },
      versions: [],
    },
    desert_doodads: {
      size: { w: 1024, h: 1024 },
      versions: ['ddnet06'],
    },
    desert_main: {
      size: { w: 1024, h: 1024 },
      versions: ['ddnet06'],
    },
    desert_mountains2: {
      size: { w: 1024, h: 512 },
      versions: ['ddnet06'],
    },
    desert_mountains_new_background: {
      size: { w: 1024, h: 512 },
      versions: [],
    },
    desert_mountains_new_foreground: {
      size: { w: 1500, h: 460 },
      versions: [],
    },
    desert_mountains: {
      size: { w: 1500, h: 830 },
      versions: ['ddnet06'],
    },
    desert_sun: {
      size: { w: 1024, h: 1024 },
      versions: ['ddnet06'],
    },
    entities: {
      size: { w: 1024, h: 1024 },
      versions: [],
    },
    fadeout: {
      size: { w: 1024, h: 1024 },
      versions: [],
    },
    font_teeworlds_alt: {
      size: { w: 1024, h: 1024 },
      versions: [],
    },
    font_teeworlds: {
      size: { w: 1024, h: 1024 },
      versions: [],
    },
    generic_clear: {
      size: { w: 1024, h: 1024 },
      versions: [],
    },
    generic_deathtiles: {
      size: { w: 1024, h: 1024 },
      versions: ['ddnet06'],
    },
    generic_lamps: {
      size: { w: 1024, h: 1024 },
      versions: [],
    },
    'generic_unhookable_0.7': {
      size: { w: 1024, h: 1024 },
      versions: [],
    },
    generic_unhookable: {
      size: { w: 1024, h: 1024 },
      versions: ['ddnet06'],
    },
    'grass_doodads_0.7': {
      size: { w: 1024, h: 1024 },
      versions: [],
    },
    grass_doodads: {
      size: { w: 1024, h: 1024 },
      versions: ['ddnet06'],
    },
    'grass_main_0.7': {
      size: { w: 1024, h: 1024 },
      versions: [],
    },
    grass_main: {
      size: { w: 1024, h: 1024 },
      versions: ['ddnet06'],
    },
    jungle_background: {
      size: { w: 809, h: 1312 },
      versions: ['ddnet06'],
    },
    jungle_deathtiles: {
      size: { w: 1024, h: 1024 },
      versions: ['ddnet06'],
    },
    jungle_doodads: {
      size: { w: 1024, h: 1024 },
      versions: ['ddnet06'],
    },
    jungle_main: {
      size: { w: 1024, h: 1024 },
      versions: ['ddnet06'],
    },
    jungle_midground: {
      size: { w: 1024, h: 1024 },
      versions: ['ddnet06'],
    },
    jungle_unhookables: {
      size: { w: 1024, h: 1024 },
      versions: ['ddnet06'],
    },
    light: {
      size: { w: 256, h: 256 },
      versions: [],
    },
    mixed_tiles: {
      size: { w: 1024, h: 1024 },
      versions: [],
    },
    moon: {
      size: { w: 1024, h: 1024 },
      versions: ['ddnet06'],
    },
    mountains: {
      size: { w: 1024, h: 512 },
      versions: ['ddnet06'],
    },
    round_tiles: {
      size: { w: 1024, h: 1024 },
      versions: [],
    },
    snow_mountain: {
      size: { w: 64, h: 64 },
      versions: [],
    },
    snow: {
      size: { w: 1024, h: 512 },
      versions: ['ddnet06'],
    },
    stars: {
      size: { w: 265, h: 128 },
      versions: ['ddnet06'],
    },
    sun: {
      size: { w: 512, h: 512 },
      versions: ['ddnet06'],
    },
    water: {
      size: { w: 1024, h: 1024 },
      versions: [],
    },
    winter_doodads: {
      size: { w: 1024, h: 1024 },
      versions: ['ddnet06'],
    },
    winter_main: {
      size: { w: 1024, h: 1024 },
      versions: ['ddnet06'],
    },
    winter_mountains2: {
      size: { w: 1024, h: 512 },
      versions: ['ddnet06'],
    },
    winter_mountains3: {
      size: { w: 1024, h: 512 },
      versions: ['ddnet06'],
    },
    winter_mountains: {
      size: { w: 1024, h: 512 },
      versions: ['ddnet06'],
    },
  }

  const dispatch = createEventDispatcher()

  $: embeddedImages = images.filter(img => !img.external)

  const externalNames = Object.keys(externalImages)

  let file: File | null = null
  let embedded: Image | null = null
  let external = -1
  $: resetSelection(image)

  $: selectedName =
    external !== -1
      ? externalNames[external] + ' (external)'
      : embedded
        ? embedded.name + ' (embedded)'
        : file
          ? file.name + ' (upload)'
          : 'none'

  function resetSelection(image: Image | null) {
    file = null
    embedded = image?.external ? null : image
    external = image?.external ? externalNames.indexOf(image.name) : -1
  }

  function onConfirm() {
    if (embedded) {
      dispatch('pick', embedded)
    } else if (file) {
      dispatch('pick', file)
    } else if (external !== -1) {
      const name = externalNames[external]
      const size = externalImages[name].size
      dispatch('pick', [name, { size }])
    } else {
      dispatch('pick', null)
    }
    resetSelection(image)
  }

  function onCancel() {
    dispatch('cancel')
    resetSelection(image)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') onCancel()
  }

  function onDeleteImage(image: Image) {
    dispatch('delete', image)
  }

  function selectExternal(i: number) {
    embedded = null
    file = null
    external = external === i ? -1 : i
  }

  function selectEmbedded(img: Image) {
    embedded = embedded === img ? null : img
    file = null
    external = -1
  }

  function selectFile(f: File | null) {
    embedded = null
    file = f
    external = -1
  }

  function getImgURL(image: Image) {
    if (image.data instanceof HTMLImageElement) {
      return image.data.src
    } else if (image.data instanceof ImageData) {
      const canvas = document.createElement('canvas')
      canvas.width = image.data.width
      canvas.height = image.data.height
      const ctx = canvas.getContext('2d')!
      ctx.putImageData(image.data, 0, 0)
      return canvas.toDataURL()
    } else {
      console.warn('unsupported image data type:', image)
      return ''
    }
  }
</script>

<svelte:window on:keydown={onKeyDown} />

<div id="image-picker">
  <Tabs>
    <Tab label="Upload image" />
    <Tab label="Embedded images" />
    <Tab label="External images" />
    <svelte:fragment slot="content">
      <TabContent>
        <FileUploader
          labelTitle="Upload an image"
          buttonLabel="Pick a file"
          labelDescription="Only png files are accepted."
          accept={['.png']}
          status="complete"
          on:change={e => selectFile(e.detail.length === 1 ? e.detail[0] : null)}
          files={file === null ? [] : [file]}
        />
      </TabContent>
      <TabContent class="images">
        {#if embeddedImages.length === 0}
          <p>No embedded images available. Upload an image or embed an external image first.</p>
        {/if}
        <div class="list">
          {#each embeddedImages as img}
            <button
              class="default image"
              class:selected={embedded === img}
              on:click={() => selectEmbedded(img)}
            >
              <img src={getImgURL(img)} alt={img.name} />
              <div class="hover">
                <span>{img.name}</span>
              </div>
              <button on:click|stopPropagation={() => onDeleteImage(img)}>&times;</button>
            </button>
          {/each}
        </div>
      </TabContent>
      <TabContent class="images">
        <div class="list">
          {#each externalNames as img, i}
            <button
              class="default image"
              class:selected={external === i}
              on:click={() => selectExternal(i)}
            >
              <img src="/mapres/{img}.png" alt={img} />
              <div class="hover">
                <span>{img}</span>
              </div>
            </button>
          {/each}
        </div>
      </TabContent>
    </svelte:fragment>
  </Tabs>
  <div class="footer">
    <span>Selected: {selectedName}</span>
    <div>
      <button class="default large" on:click={onCancel}>Cancel</button>
      <button class="primary large" on:click={onConfirm}>Confirm</button>
    </div>
  </div>
</div>
