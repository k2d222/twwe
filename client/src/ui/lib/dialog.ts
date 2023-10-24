import Dialog from './dialog.svelte'

type DialogType = 'info' | 'warning' | 'error'

type DialogControls = 'closable' | 'yesno' | 'none'

let dialog: Dialog

export function setDialog(d: Dialog) {
  dialog = d

  dialog.$on('close', e => {
    const [id] = e.detail
    clearDialog(id)
  })
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
  controls: DialogControls = 'none',
  timeout: number = 5000
): Promise<boolean> | number {
  const id = Math.random()
  dialog.$set({
    messages: [{
      type,
      message,
      controls,
      id
    }, ...dialog.messages]
  })

  if (controls === 'none')
    return id
  else
    return new Promise(resolve => {
      let timeout_id = 0
      dialog.$on('close', e => {
        if (e.detail[0] === id) {
          window.clearTimeout(timeout_id)
          resolve(e.detail[1])
        }
      })
      if (timeout && controls === 'closable') {
        timeout_id = window.setTimeout(() => {
          clearDialog(id)
          resolve(false)
        }, timeout)
      }
    })
}

export function showInfo(msg: string): Promise<boolean>; 
export function showInfo(msg: string, controls: 'none'): number; 
export function showInfo(msg: string, controls: DialogControls): Promise<boolean>; 
export function showInfo(msg: string, controls: DialogControls = 'closable') {
  return showDialog('info', msg, controls)
}

export function showWarning(msg: string): Promise<boolean>; 
export function showWarning(msg: string, controls: 'none'): number; 
export function showWarning(msg: string, controls: DialogControls): Promise<boolean>; 
export function showWarning(msg: string, controls: DialogControls = 'closable') {
  return showDialog('warning', msg, controls)
}

export function showError(msg: string): Promise<boolean>; 
export function showError(msg: string, controls: 'none'): number; 
export function showError(msg: string, controls: DialogControls): Promise<boolean>; 
export function showError(msg: string, controls: DialogControls = 'closable') {
  return showDialog('error', msg, controls)
}
