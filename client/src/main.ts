import Svelte from './ui/index.svelte'
import { init as glInit } from './gl/global'
import { server } from './ui/global'
import { showError, showInfo } from './ui/lib/dialog'

function main() {
  glInit()

  // a quick hack to handle websocket server errors.
  server.socket.onclose = async e => {
    console.error(e)
    await showError('Server closed: ' + (e.reason || 'unknown reason'))
    const reload = await showInfo('Reload page?', 'yesno')
    if (reload) window.location.reload()
  }

  new Svelte({
    target: document.body,
  })
}

main()
