import Svelte from './ui/index.svelte'
import Dialog from './ui/lib/dialog.svelte'
import { setDialog } from './ui/lib/dialog'

function main() {
  new Svelte({
    target: document.body,
  })
  setDialog(
    new Dialog({
      target: document.body,
    })
  )
}

main()
