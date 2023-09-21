import Dialog from './dialog.svelte'

type DialogType = 'info' | 'warning' | 'error'

type DialogControls = 'closable' | 'yesno' | 'none'

let dialog: Dialog

export function setDialog(d: Dialog) {
  dialog = d
}

export function clearDialog(id: number | 'all' = 'all') {
  if (id === 'all') {
    dialog.$set({ messages: [] })
  }
  else {
    dialog.$set({ messages: dialog.messages.filter(m => m.id !== id) })
  }
}

export function showDialog(
  type: DialogType,
  message: string,
  controls: DialogControls = 'none'
): Promise<boolean> {


  dialog.$set({
    messages: [{
      type,
      message,
      controls,
      id: Math.random()
    }, ...dialog.messages]
  })

  return new Promise(resolve => {
    dialog.$on('close', e => {
      const [id, status] = e.detail
      clearDialog(id)
      resolve(status)
    })
  })
}

export function showInfo(msg: string, controls: DialogControls = 'closable') {
  return showDialog('info', msg, controls)
}

export function showWarning(msg: string, controls: DialogControls = 'closable') {
  return showDialog('warning', msg, controls)
}
export function showError(msg: string, controls: DialogControls = 'closable') {
  return showDialog('error', msg, controls)
}
