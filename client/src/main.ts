import Svelte from './ui/index.svelte'
import { init as glInit } from './gl/global'

function main() {
  glInit()

  new Svelte({
    target: document.body,
  })
}

main()
