<script lang="ts">
  let frames = 0
  let startTime = 0
  let fps = 0

  export let time: number

  $: {
    frames++

    if (time >= startTime + 1000) {
      fps = Math.round((frames * 1000) / (time - startTime))
      startTime = time
      frames = 0
    }
  }
</script>

<div id="stats">
  {fps} fps
</div>
