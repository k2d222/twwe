<script lang="ts">
   import type { RenderMap } from '../../gl/renderMap'

   export let rmap: RenderMap
   export let visible: boolean = false
</script>

<div id='envelope-editor' class:hidden={!visible}>
   coucou
</div>
