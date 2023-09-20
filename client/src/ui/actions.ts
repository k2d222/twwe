import { showDialog, showError, showInfo } from "./lib/dialog"
import { server, serverConfig, rmap, peers } from "./global"
import { get } from "svelte/store"
import { navigate } from 'svelte-routing'
import { download } from "./lib/util"

export async function saveMap() {
  const server_ = get(server)

  try {
    showInfo('Saving map...', 'none')
    await server_.query('map/save', undefined)
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
      await server_.query('leave', rmap_.map.name)
      await server_.query('delete/map', rmap_.map.name)
      navigate('/')
    } catch (e) {
      showError('Map deletion failed: ' + e)
    }
  }
}

export async function goToLobby() {
  const server_ = get(server)

  await server_.query('leave', undefined)
  navigate('/')
}

export async function saveInfo() {
  const server_ = get(server)
  const rmap_ = get(rmap)

  try {
    await server_.query('map/post/info', rmap_.map.info)
  } catch (e) {
    showError('Failed to edit map info: ' + e)
  }
}