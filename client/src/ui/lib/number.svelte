<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { FormInputEvent } from './util'

  export let label: string = ''
  export let min: number = -2_147_483_648 // default: I32 min
  export let max: number = 2_147_483_647 // default: I32 max
  export let step: number = 1
  export let value: number = 0
  export let integer: boolean = false
  export let disabled: boolean = false

  const dispatch = createEventDispatcher<{ change: number }>()

  function clamp(cur: number, min: number, max: number) {
    return Math.min(Math.max(min, cur), max)
  }

  function onChange(e: FormInputEvent) {
    let val = integer ? parseInt(e.currentTarget.value) : parseFloat(e.currentTarget.value)

    if (isNaN(val)) return

    val = clamp(val, min, max)
    value = val
    dispatch('change', value)
  }
</script>

<label>
  <span>{label}</span>
  <input type="number" {min} {max} {step} {value} {disabled} on:change={onChange} />
</label>
