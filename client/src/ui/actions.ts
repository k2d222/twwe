import { clearDialog, showDialog, showError, showInfo } from './lib/dialog'
import { server, rmap, peers } from './global'
import { get } from 'svelte/store'
import { navigate } from 'svelte-routing'
import { download } from './lib/util'

export async function saveMap() {
  const server_ = get(server)
  const id = showInfo('Saving map...', 'none')
  try {
    await server_.query('save', undefined)
    showInfo('Map saved on the server.', 'closable')
  } catch (e) {
    showError('Failed to save map: ' + e)
  }
  clearDialog(id)
}

export async function downloadMap() {
  const rmap_ = get(rmap)
  const server_ = get(server)
  const name = rmap_.map.name

  const id = showInfo(`Downloading '${name}'…`, 'none')
  try {
    const resp = await server_.fetch('maps/' + name)
    const data = await resp.blob()
    download(data, name + '.map')
    showInfo(`Downloaded '${name}'.`)
  } catch (e) {
    showError(`Failed to download ${name}: ${e}`)
  } finally {
    clearDialog(id)
  }
}

export async function deleteMap() {
  const peers_ = get(peers)
  const server_ = get(server)
  const rmap_ = get(rmap)

  if (peers_ !== 1) {
    showError('Cannot delete map while other users are connected')
    return
  }

  const res = await showDialog('warning', 'Are you sure you want to delete this map?', 'yesno')

  if (res) {
    try {
      await server_.query('delete', rmap_.map.name)
      await server_.query('leave', rmap_.map.name)
      navigate('/')
    } catch (e) {
      showError('Map deletion failed: ' + e)
    }
  }
}

export async function renameMap() {
  const peers_ = get(peers)
  const server_ = get(server)
  const rmap_ = get(rmap)

  if (peers_ !== 1) {
    showError('Cannot rename map while other users are connected')
    return
  }

  const name = prompt(`Rename map ${rmap_.map.name}`)

  if (name) {
    try {
      await server_.query('edit/config', { name })
    } catch (e) {
      showError('Failed to rename map: ' + e)
    }
  }
}

export async function goToLobby() {
  navigate('/')
}
