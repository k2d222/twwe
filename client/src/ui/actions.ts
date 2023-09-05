import { showDialog, showError, showInfo } from "./lib/dialog"
import { server, serverConfig, rmap, peers } from "./global"
import { get } from "svelte/store"
import { navigate } from 'svelte-routing'
import { download } from "./lib/util"
import type { EditMap } from "src/server/protocol"

export async function saveMap() {
  const server_ = get(server)
  const rmap_ = get(rmap)

  try {
    showInfo('Saving map...', 'none')
    await server_.query('savemap', { name: rmap_.map.name })
    showInfo('Map saved on the server.', 'closable')
  } catch (e) {
    showError('Failed to save map: ' + e)
  }
}

export async function downloadMap() {
  const serverConf_ = get(serverConfig)
  const rmap_ = get(rmap)

  download(`${serverConf_.httpUrl}/maps/${rmap_.map.name}`, `${rmap_.map.name}.map`)
}

export async function deleteMap() {
  const peers_ = get(peers)
  const server_ = get(server)
  const rmap_ = get(rmap)

  if (peers_ !== 1) {
    showError('Cannot delete map: other users are connected')
    return
  }

  const res = await showDialog('warning', 'Are you sure you want to delete this map?', 'yesno')

  if (res) {
    try {
      await server_.query('leavemap', null)
      await server_.query('deletemap', { name: rmap_.map.name })
      navigate('/')
    } catch (e) {
      showError('Map deletion failed: ' + e)
    }
  }
}

export async function goToLobby() {
  const server_ = get(server)

  await server_.query('leavemap', null)
  navigate('/')
}

export async function saveInfo() {
  const server_ = get(server)
  const rmap_ = get(rmap)

  try {
    const change: EditMap = {
      info: rmap_.map.info,
    }
    const res = await server_.query('editmap', change)
    rmap_.map.info = res.info
  } catch (e) {
    showError('Failed to edit map info: ' + e)
  }
}