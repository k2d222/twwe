import Dialog from './dialog.svelte'

type DialogType = 'info' | 'warning' | 'error'

let dialog: Dialog | null = null

export function clearDialog() {
  if(dialog) {
    dialog.$destroy()
    dialog = null
  }
}

export function showDialog(type: DialogType, message: string, closable: boolean): Promise<void> {
  clearDialog()
  dialog = new Dialog({
    target: document.body,
    props: {
      type,
      message,
      closable,
    }
  })
  
  return new Promise((resolve) => {
    dialog.$on('close', () => {
      clearDialog()
      resolve() 
    })
  })
}


export function showInfo(msg: string, closable = true) {
  return showDialog('info', msg, closable)
}

export function showWarning(msg: string, closable = true) {
  return showDialog('warning', msg, closable)
}
export function showError(msg: string, closable = true) {
  return showDialog('error', msg, closable)
}