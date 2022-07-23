<script lang="ts">
  import type * as Info from '../../twmap/types'

  export let quad: Info.Quad
  export let p: number

  function pointName(p: number) {
    if (p === 0) return 'Top Left'
    else if (p === 1) return 'Top Right'
    else if (p === 2) return 'Bottom Left'
    else if (p === 3) return 'Bottom Right'
    else return 'Center'
  }
</script>


<div class="edit-quad">
  <span>Quad {pointName(p)}</span>
</div>
