<script lang="ts">
  import type { Image } from '../../twmap/image'
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher()

  const externalImages = [
    "basic_freeze",
    "bg_cloud1",
    "bg_cloud2",
    "bg_cloud3",
    "ddmax_freeze",
    "ddnet_start",
    "ddnet_tiles",
    "ddnet_walls",
    "desert_background",
    "desert_doodads",
    "desert_main",
    "desert_mountains2",
    "desert_mountains_new_background",
    "desert_mountains_new_foreground",
    "desert_mountains",
    "desert_sun",
    "entities",
    "fadeout",
    "font_teeworlds_alt",
    "font_teeworlds",
    "generic_clear",
    "generic_deathtiles",
    "generic_lamps",
    "generic_unhookable_0.7",
    "generic_unhookable",
    "grass_doodads_0.7",
    "grass_doodads",
    "grass_main_0.7",
    "grass_main",
    "jungle_background",
    "jungle_deathtiles",
    "jungle_doodads",
    "jungle_main",
    "jungle_midground",
    "jungle_unhookables",
    "light",
    "mixed_tiles",
    "moon",
    "mountains",
    "round_tiles",
    "snow_mountain",
    "snow",
    "stars",
    "sun",
    "water",
    "winter_doodads",
    "winter_main",
    "winter_mountains2",
    "winter_mountains3",
    "winter_mountains",
  ]

  export let images: Image[] = []
  
  export let image: Image | null = null
  export let external = -1
  $: console.log(image, images)

  // only keep embedded images
  $: images = images.filter(img => !img.img)

  function onConfirm() {
    if (image)
      dispatch('pick', { embedded: image })
    else if (external !== -1)
      dispatch('pick', { external: externalImages[external] })
    else
      dispatch('pick', {})
  }

  function onCancel() {
      dispatch('cancel')
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape')
      onCancel()
  }

  function selectExternal(i: number) {
    external = i
    image = null
  }

  function selectEmbedded(img: Image) {
    external = -1
    image = img  
  }

  function getImgURL(image: Image) {
    if (image.img !== null) {
      return image.img.src
    }
    else if (image.data instanceof ImageData) {
      const canvas = document.createElement('canvas')
      canvas.width = image.data.width
      canvas.height = image.data.height
      const ctx = canvas.getContext('2d')
      ctx.putImageData(image.data, 0, 0)
      return canvas.toDataURL()
    }
    else {
      console.warn('unsupported image data type:', image)
      return ""
    }
  }

  $: selectedName = image ? image.name + " (embedded)" : external !== -1 ? externalImages[external] + " (external)" : "none"
  

</script>

<svelte:window on:keydown={onKeyDown} />

<div id="image-picker">
  <div class="content">
    <h3>Embedded images</h3>
    <div class="images">
      {#each images as img}
        <div class="image" class:selected={image === img} on:click={() => selectEmbedded(img)}>
          <img src={getImgURL(img)} alt={img.name}>
          <div class="hover">
            <span>{img.name}</span>
          </div>
        </div>
      {/each}
    </div>
    <h3>External images</h3>
    <div class="images">
      {#each externalImages as img, i}
        <div class="image" class:selected={external === i} on:click={() => selectExternal(i)}>
          <img src="/mapres/{img}.png" alt={img}>
          <div class="hover">
            <span>{img}</span>
          </div>
        </div>
      {/each}
    </div>
  </div>
  <div class="footer">
    <span>Selected: {selectedName}</span>
    <div>
      <button class="cancel" on:click={onCancel}>Cancel</button>
      <button class="confirm" on:click={onConfirm}>Confirm</button>
    </div>
  </div>
</div>
