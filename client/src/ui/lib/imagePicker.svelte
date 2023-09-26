<script lang="ts">
  import type { Image } from '../../twmap/image'
  import { createEventDispatcher } from 'svelte'
  import { FileUploader, Tab, TabContent, Tabs } from 'carbon-components-svelte'

  export let images: Image[] = []
  export let image: Image | null = null

  const dispatch = createEventDispatcher()

  const externalImages = [
    'basic_freeze',
    'bg_cloud1',
    'bg_cloud2',
    'bg_cloud3',
    'ddmax_freeze',
    'ddnet_start',
    'ddnet_tiles',
    'ddnet_walls',
    'desert_background',
    'desert_doodads',
    'desert_main',
    'desert_mountains2',
    'desert_mountains_new_background',
    'desert_mountains_new_foreground',
    'desert_mountains',
    'desert_sun',
    'entities',
    'fadeout',
    'font_teeworlds_alt',
    'font_teeworlds',
    'generic_clear',
    'generic_deathtiles',
    'generic_lamps',
    'generic_unhookable_0.7',
    'generic_unhookable',
    'grass_doodads_0.7',
    'grass_doodads',
    'grass_main_0.7',
    'grass_main',
    'jungle_background',
    'jungle_deathtiles',
    'jungle_doodads',
    'jungle_main',
    'jungle_midground',
    'jungle_unhookables',
    'light',
    'mixed_tiles',
    'moon',
    'mountains',
    'round_tiles',
    'snow_mountain',
    'snow',
    'stars',
    'sun',
    'water',
    'winter_doodads',
    'winter_main',
    'winter_mountains2',
    'winter_mountains3',
    'winter_mountains',
  ]

  let external = -1

  let file: File | null = null
  
  $: external = image && image.img ? externalImages.indexOf(image.name) : external

  $: selectedName =
    external !== -1
      ? externalImages[external] + ' (external)'
      : image
      ? image.name + ' (embedded)'
      : file
      ? file.name + ' (upload)'
      : 'none'

  function onConfirm() {
    if (image) {
      dispatch('pick', image)
    } else if (file) {
      dispatch('pick', file)
      file = null
    } else if (external !== -1) {
      dispatch('pick', externalImages[external])
    } else {
      dispatch('pick', null)
    }
  }

  function onCancel() {
    dispatch('cancel')
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') onCancel()
  }

  function onDeleteImage(image: Image) {
    dispatch('delete', image)
  }

  function selectExternal(i: number) {
    image = null
    file = null
    external = external === i ? -1 : i
  }

  function selectEmbedded(img: Image) {
    image = image === img ? null : img
    file = null
    external = -1
  }

  function selectFile(f: File | null) {
    image = null
    file = f
    external = -1
  }

  function getImgURL(image: Image) {
    if (image.img !== null) {
      return image.img.src
    }
    else if (image.data instanceof ImageData) {
      const canvas = document.createElement('canvas')
      canvas.width = image.data.width
      canvas.height = image.data.height
      const ctx = canvas.getContext('2d')!
      ctx.putImageData(image.data, 0, 0)
      return canvas.toDataURL()
    }
    else {
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
          on:change={(e) => selectFile(e.detail.length === 1 ? e.detail[0] : null)}
          files={file === null ? [] : [file]}
        />
      </TabContent>
      <TabContent class="images">
        {#if images.length === 0}
          <p>No embedded images available. Upload an image or embed an external image first.</p>
        {/if}
        <div class="list">
          {#each images as img}
            <button
              class="default image"
              class:selected={image === img}
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
          {#each externalImages as img, i}
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
