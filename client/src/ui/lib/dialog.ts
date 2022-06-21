import Dialog from './dialog.svelte'

type DialogType = 'info' | 'warning' | 'error'

type DialogControls = 'closable' | 'yesno' | 'none'

let dialog: Dialog | null = null

export function clearDialog() {
  if(dialog) {
    dialog.$destroy()
    dialog = null
  }
}

export function showDialog(type: DialogType, message: string, controls: DialogControls = 'none'): Promise<boolean> {
  clearDialog()
  dialog = new Dialog({
    target: document.body,
    props: {
      type,
      message,
      controls,
    }
  })
  
  return new Promise((resolve) => {
    dialog.$on('close', (e) => {
      clearDialog()
      resolve(e.detail)
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