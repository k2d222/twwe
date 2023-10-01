<<<<<<< Updated upstream
// import { ColorEnvelope, PositionEnvelope, SoundEnvelope } from 'src/twmap/envelope'
// import { QuadsLayer } from 'src/twmap/quadsLayer'
// import { TilesLayer } from 'src/twmap/tilesLayer'
// import * as MapDir from '../twmap/mapdir'
// import type { Map } from '../twmap/map'
// import { colorToJson, coordToJson, curveTypeToString, resIndexToString, toFixedNum, uvToJson } from './convert'
// import type { Recv, RecvKey, Send, SendKey, SendPacket } from './protocol'
||||||| Stash base
import { ColorEnvelope, PositionEnvelope, SoundEnvelope } from 'src/twmap/envelope'
import { QuadsLayer } from 'src/twmap/quadsLayer'
import { TilesLayer } from 'src/twmap/tilesLayer'
import * as MapDir from '../twmap/mapdir'
import type { Map } from '../twmap/map'
import { colorToJson, coordToJson, curveTypeToString, resIndexToString, toFixedNum, uvToJson } from './convert'
import type { Recv, RecvKey, Send, SendKey, SendPacket } from './protocol'
=======
import { ColorEnvelope, PositionEnvelope, SoundEnvelope } from 'src/twmap/envelope'
import { QuadsLayer } from 'src/twmap/quadsLayer'
import { TilesLayer } from 'src/twmap/tilesLayer'
import * as MapDir from '../twmap/mapdir'
import type { Map } from '../twmap/map'
import { colorToJson, coordToJson, curveTypeToString, resIndexToString, toFixedNum, uvToJson } from './convert'
import type { Recv, RecvKey, RecvPacket, Send, SendKey, SendPacket, RespPacket, Resp } from './protocol'
import { rmap } from 'src/ui/global'
import { get } from 'svelte/store'
import { Server } from './server'
>>>>>>> Stashed changes

<<<<<<< Updated upstream
// function rev_post_envelope(map: Map, ...[e, part]: Recv['post/envelope']): Send['post/envelope'] {
//   const env = map.envelopes[e]
//   const rev_part: typeof part = { type: part.type }

//   if ('name' in part) rev_part.name = env.name
//   if ('synchronized' in part) rev_part.synchronized = env.synchronized
//   if ('points' in part) {
//     if (env instanceof ColorEnvelope) {
//       rev_part.points = env.points.map(p => ({
//         time: p.time,
//         content: colorToJson(p.content, 10),
//         type: curveTypeToString(p.type),
//       }))
//     }
//     else if (env instanceof PositionEnvelope) {
//       rev_part.points = env.points.map(p => ({
//         time: p.time,
//         content: {
//           x: toFixedNum(p.content.x, 15),
//           y: toFixedNum(p.content.y, 15),
//           rotation: toFixedNum(p.content.rotation, 10),
//         },
//         type: curveTypeToString(p.type),
//       }))
//     }
//     else if (env instanceof SoundEnvelope) {
//       rev_part.points = env.points.map(p => ({
//         time: p.time,
//         content: toFixedNum(p.content, 10),
//         type: curveTypeToString(p.type)
//       }))
//     }
//   }

//   return [e, rev_part]
// }
||||||| Stash base
function rev_post_envelope(map: Map, ...[e, part]: Recv['map/post/envelope']): Send['map/post/envelope'] {
  const env = map.envelopes[e]
  const rev_part: typeof part = { type: part.type }

  if ('name' in part) rev_part.name = env.name
  if ('synchronized' in part) rev_part.synchronized = env.synchronized
  if ('points' in part) {
    if (env instanceof ColorEnvelope) {
      rev_part.points = env.points.map(p => ({
        time: p.time,
        content: colorToJson(p.content, 10),
        type: curveTypeToString(p.type),
      }))
    }
    else if (env instanceof PositionEnvelope) {
      rev_part.points = env.points.map(p => ({
        time: p.time,
        content: {
          x: toFixedNum(p.content.x, 15),
          y: toFixedNum(p.content.y, 15),
          rotation: toFixedNum(p.content.rotation, 10),
        },
        type: curveTypeToString(p.type),
      }))
    }
    else if (env instanceof SoundEnvelope) {
      rev_part.points = env.points.map(p => ({
        time: p.time,
        content: toFixedNum(p.content, 10),
        type: curveTypeToString(p.type)
      }))
    }
  }

  return [e, rev_part]
}
=======
interface MapRes {
  map: {
    info: MapDir.Info,
    envelopes: MapDir.Envelope[],
    groups: {
      group: MapDir.Group,
      layers: MapDir.Layer[]
    }[]
  }
}
>>>>>>> Stashed changes

<<<<<<< Updated upstream
// function rev_post_group(map: Map, ...[g, part]: Recv['post/group']): Send['post/group'] {
//   const group = map.groups[g]
//   const rev_part: typeof part = {}
||||||| Stash base
function rev_post_group(map: Map, ...[g, part]: Recv['map/post/group']): Send['map/post/group'] {
  const group = map.groups[g]
  const rev_part: typeof part = {}
=======
>>>>>>> Stashed changes

<<<<<<< Updated upstream
//   if ('offset' in part) {
//     rev_part.offset = {
//       x: toFixedNum(group.offX, 5),
//       y: toFixedNum(group.offY, 5),
//     }
//   }
//   if ('parallax' in part) {
//     rev_part.parallax = {
//       x: group.paraX,
//       y: group.paraY,
//     }
//   }
//   if ('clipping' in part)
//     rev_part.clipping = group.clipping
//   if ('clip' in part) {
//     rev_part.clip = {
//       x: toFixedNum(group.clipX, 5),
//       y: toFixedNum(group.clipY, 5),
//       w: toFixedNum(group.clipW, 5),
//       h: toFixedNum(group.clipH, 5),
//     }
//   }
//   if ('name' in part)
//     rev_part.name = group.name

//   return [g, rev_part]
// }
||||||| Stash base
  if ('offset' in part) {
    rev_part.offset = {
      x: toFixedNum(group.offX, 5),
      y: toFixedNum(group.offY, 5),
    }
  }
  if ('parallax' in part) {
    rev_part.parallax = {
      x: group.paraX,
      y: group.paraY,
    }
  }
  if ('clipping' in part)
    rev_part.clipping = group.clipping
  if ('clip' in part) {
    rev_part.clip = {
      x: toFixedNum(group.clipX, 5),
      y: toFixedNum(group.clipY, 5),
      w: toFixedNum(group.clipW, 5),
      h: toFixedNum(group.clipH, 5),
    }
  }
  if ('name' in part)
    rev_part.name = group.name

  return [g, rev_part]
}
=======
enum Action {
  Get, Create, Edit, Delete, Move, Other,
}
>>>>>>> Stashed changes

<<<<<<< Updated upstream
// function rev_post_layer(map: Map, ...[g, l, part]: Recv['post/layer']): Send['post/layer'] {
//   const layer = map.groups[g].layers[l]
//   const rev_part: typeof part = { type: part.type }
||||||| Stash base
function rev_post_layer(map: Map, ...[g, l, part]: Recv['map/post/layer']): Send['map/post/layer'] {
  const layer = map.groups[g].layers[l]
  const rev_part: typeof part = { type: part.type }
=======
type Path =
    'map'
  | 'map/group'
>>>>>>> Stashed changes

<<<<<<< Updated upstream
//   if ('detail' in part)
//     rev_part.detail = layer.detail
//   if ('name' in part)
//     rev_part.name = layer.name
||||||| Stash base
  if ('detail' in part)
    rev_part.detail = layer.detail
  if ('name' in part)
    rev_part.name = layer.name
=======
interface Create {
  'map': string
  'map/group': Partial<MapDir.Group>
}
>>>>>>> Stashed changes

<<<<<<< Updated upstream
//   if (layer instanceof TilesLayer && rev_part.type === MapDir.LayerKind.Tiles) {
//     if ('color' in part)
//       rev_part.color = layer.color
//     if ('width' in part)
//       rev_part.width = layer.width
//     if ('height' in part)
//       rev_part.height = layer.height
//     if ('color_env' in part)
//       rev_part.color_env = layer.colorEnv === null ? null : resIndexToString(map.envelopes.indexOf(layer.colorEnv), '')
//     if ('color_env_offset' in part)
//       rev_part.color_env_offset = layer.colorEnvOffset
//     if ('image' in part)
//       rev_part.image = layer.image === null ? null : resIndexToString(map.images.indexOf(layer.image), '')
//     if ('automapper_config' in part) {
//       rev_part.automapper_config = {
//         config: layer.automapper.config === -1 ? null : layer.automapper.config,
//         seed: layer.automapper.seed,
//         automatic: layer.automapper.automatic,
//       }
//     }
//   }
//   else if (layer instanceof QuadsLayer && rev_part.type === MapDir.LayerKind.Quads) {
//     if ('image' in part)
//       rev_part.image = layer.image === null ? null : resIndexToString(map.images.indexOf(layer.image), '')
//   }

//   return [g, l, rev_part]

// }

// function rev_post_quad(map: Map, ...[g, l, q, part]: Recv['post/quad']): Send['post/quad'] {
//   const quad = (map.groups[g].layers[l] as QuadsLayer).quads[q]
//   const rev_part: typeof part = {
//       corners: quad.points.slice(0, 4).map(p => coordToJson(p, 15)),
//       position: coordToJson(quad.points[4], 15),
//       colors: quad.colors,
//       texture_coords: quad.texCoords.map(p => uvToJson(p, 10)),
//       position_env: quad.posEnv === null ? null : resIndexToString(map.envelopes.indexOf(quad.posEnv), ''),
//       position_env_offset: quad.posEnvOffset,
//       color_env: quad.colorEnv === null ? null : resIndexToString(map.envelopes.indexOf(quad.colorEnv), ''),
//       color_env_offset: quad.colorEnvOffset
//   }
//   return [g, l, q, rev_part]
// }

// function push(map: Map, pkt: SendPacket<SendKey & RecvKey>) {
//   if (pkt.type === 'put/image') {
//     const i = map.images.length
//     return ['delete/image', i]
//   }
//   else if (pkt.type === 'put/envelope') {
//     const e = map.envelopes.length
//     return ['delete/envelope', e]
//   }
//   else if (pkt.type === 'put/group') {
//     const g = map.groups.length
//     return ['delete/group', g]
//   }
//   else if (pkt.type === 'put/layer') {
//     const [g, ] = pkt.content as Send['put/layer']
//     const l = map.groups[g].layers.length
//     return ['delete/layer', [g, l]]
//   }
//   else if (pkt.type === 'put/quad') {
//     const [g, l, ] = pkt.content as Send['put/quad']
//     const q = (map.groups[g].layers[l] as QuadsLayer).quads.length
//     return ['delete/quad', [g, l, q]]
//   }
//   // TODO
//   else if (pkt.type === 'put/automapper') {
//     return null
//   }
//   // TODO
//   else if (pkt.type === 'post/config') {
//     return null
//   }
//   else if (pkt.type === 'post/info') {
//     const part = pkt.content as Send['post/info']
//     const rev_part = Object.fromEntries(Object.keys(part).map(k => 
//       [k, map.info[k]]
//     ))
//     return ['post/info', rev_part]
//   }
//   else if (pkt.type === 'post/envelope') {
//     const [e, part] = pkt.content as Send['post/envelope']
//     return ['post/envelope', rev_post_envelope(map, e, part)]
//   }
//   else if (pkt.type === 'post/group') {
//     const [g, part] = pkt.content as Send['post/group']
//     return ['post/group', rev_post_group(map, g, part)]
//   }
//   else if (pkt.type === 'post/layer') {
//     const [g, l, part] = pkt.content as Send['post/layer']
//     return ['post/layer', rev_post_layer(map, g, l, part)]
//   }
//   // TODO
//   else if (pkt.type === 'post/tiles') {
//     return null
//   }
//   else if (pkt.type === 'post/quad') {
//     const [g, l, q, part] = pkt.content as Send['post/quad']
//     return ['post/quad', rev_post_quad(map, g, l, q, part)]
//   }
//   // non-revertible
//   else if (pkt.type === 'post/automap') {
//     return null
//   }
//   else if (pkt.type === 'patch/envelope') {
//     const [src, tgt] = pkt.content as Send['post/envelope']
//     return ['post/envelope', [tgt, src]]
//   }
//   else if (pkt.type === 'patch/group') {
//     const [src, tgt] = pkt.content as Send['post/group']
//     return ['post/group', [tgt, src]]
//   }
//   else if (pkt.type === 'patch/layer') {
//     const [src, tgt] = pkt.content as Send['post/layer']
//     return ['post/layer', [tgt, src]]
//   }
//   else if (pkt.type === 'delete/image') {
//     return null
//   }
//   else if (pkt.type === 'delete/envelope') {
//     return null
//   }
//   else if (pkt.type === 'delete/group') {
//     return null
//   }
//   else if (pkt.type === 'delete/layer') {
//     return null
//   }
//   else if (pkt.type === 'delete/quad') {
//     return null
//   }
//   else if (pkt.type === 'delete/automapper') {
//     return null
//   }
//   else if (pkt.type === 'post/map') {
//     return null
//   }
//   else if (pkt.type === 'delete/map') {
//     return null
//   }

//   else {
//     const _exhaustive: never = pkt.type // typescript: ensure exhaustive check
//     return _exhaustive
//   }
// }
||||||| Stash base
  if (layer instanceof TilesLayer && rev_part.type === MapDir.LayerKind.Tiles) {
    if ('color' in part)
      rev_part.color = layer.color
    if ('width' in part)
      rev_part.width = layer.width
    if ('height' in part)
      rev_part.height = layer.height
    if ('color_env' in part)
      rev_part.color_env = layer.colorEnv === null ? null : resIndexToString(map.envelopes.indexOf(layer.colorEnv), '')
    if ('color_env_offset' in part)
      rev_part.color_env_offset = layer.colorEnvOffset
    if ('image' in part)
      rev_part.image = layer.image === null ? null : resIndexToString(map.images.indexOf(layer.image), '')
    if ('automapper_config' in part) {
      rev_part.automapper_config = {
        config: layer.automapper.config === -1 ? null : layer.automapper.config,
        seed: layer.automapper.seed,
        automatic: layer.automapper.automatic,
      }
    }
  }
  else if (layer instanceof QuadsLayer && rev_part.type === MapDir.LayerKind.Quads) {
    if ('image' in part)
      rev_part.image = layer.image === null ? null : resIndexToString(map.images.indexOf(layer.image), '')
  }

  return [g, l, rev_part]

}

function rev_post_quad(map: Map, ...[g, l, q, part]: Recv['map/post/quad']): Send['map/post/quad'] {
  const quad = (map.groups[g].layers[l] as QuadsLayer).quads[q]
  const rev_part: typeof part = {
      corners: quad.points.slice(0, 4).map(p => coordToJson(p, 15)),
      position: coordToJson(quad.points[4], 15),
      colors: quad.colors,
      texture_coords: quad.texCoords.map(p => uvToJson(p, 10)),
      position_env: quad.posEnv === null ? null : resIndexToString(map.envelopes.indexOf(quad.posEnv), ''),
      position_env_offset: quad.posEnvOffset,
      color_env: quad.colorEnv === null ? null : resIndexToString(map.envelopes.indexOf(quad.colorEnv), ''),
      color_env_offset: quad.colorEnvOffset
  }
  return [g, l, q, rev_part]
}

function push(map: Map, pkt: SendPacket<SendKey & RecvKey>) {
  if (pkt.type === 'map/put/image') {
    const i = map.images.length
    return ['map/delete/image', i]
  }
  else if (pkt.type === 'map/put/envelope') {
    const e = map.envelopes.length
    return ['map/delete/envelope', e]
  }
  else if (pkt.type === 'map/put/group') {
    const g = map.groups.length
    return ['map/delete/group', g]
  }
  else if (pkt.type === 'map/put/layer') {
    const [g, ] = pkt.content as Send['map/put/layer']
    const l = map.groups[g].layers.length
    return ['map/delete/layer', [g, l]]
  }
  else if (pkt.type === 'map/put/quad') {
    const [g, l, ] = pkt.content as Send['map/put/quad']
    const q = (map.groups[g].layers[l] as QuadsLayer).quads.length
    return ['map/delete/quad', [g, l, q]]
  }
  // TODO
  else if (pkt.type === 'map/put/automapper') {
    return null
  }
  // TODO
  else if (pkt.type === 'map/post/config') {
    return null
  }
  else if (pkt.type === 'map/post/info') {
    const part = pkt.content as Send['map/post/info']
    const rev_part = Object.fromEntries(Object.keys(part).map(k => 
      [k, map.info[k]]
    ))
    return ['map/post/info', rev_part]
  }
  else if (pkt.type === 'map/post/envelope') {
    const [e, part] = pkt.content as Send['map/post/envelope']
    return ['map/post/envelope', rev_post_envelope(map, e, part)]
  }
  else if (pkt.type === 'map/post/group') {
    const [g, part] = pkt.content as Send['map/post/group']
    return ['map/post/group', rev_post_group(map, g, part)]
  }
  else if (pkt.type === 'map/post/layer') {
    const [g, l, part] = pkt.content as Send['map/post/layer']
    return ['map/post/layer', rev_post_layer(map, g, l, part)]
  }
  // TODO
  else if (pkt.type === 'map/post/tiles') {
    return null
  }
  else if (pkt.type === 'map/post/quad') {
    const [g, l, q, part] = pkt.content as Send['map/post/quad']
    return ['map/post/quad', rev_post_quad(map, g, l, q, part)]
  }
  // non-revertible
  else if (pkt.type === 'map/post/automap') {
    return null
  }
  else if (pkt.type === 'map/patch/envelope') {
    const [src, tgt] = pkt.content as Send['map/post/envelope']
    return ['map/post/envelope', [tgt, src]]
  }
  else if (pkt.type === 'map/patch/group') {
    const [src, tgt] = pkt.content as Send['map/post/group']
    return ['map/post/group', [tgt, src]]
  }
  else if (pkt.type === 'map/patch/layer') {
    const [src, tgt] = pkt.content as Send['map/post/layer']
    return ['map/post/layer', [tgt, src]]
  }
  else if (pkt.type === 'map/delete/image') {
    return null
  }
  else if (pkt.type === 'map/delete/envelope') {
    return null
  }
  else if (pkt.type === 'map/delete/group') {
    return null
  }
  else if (pkt.type === 'map/delete/layer') {
    return null
  }
  else if (pkt.type === 'map/delete/quad') {
    return null
  }
  else if (pkt.type === 'map/delete/automapper') {
    return null
  }
  else if (pkt.type === 'post/map') {
    return null
  }
  else if (pkt.type === 'delete/map') {
    return null
  }

  else {
    const _exhaustive: never = pkt.type // typescript: ensure exhaustive check
    return _exhaustive
  }
}
=======
type Packet<T extends Path> = {
  id: number
  path: T
  action: Action
} & ({
  action: Action.Get
} | {
  action: Action.Create
  content: Create[T]
})
type AnyPacket = Packet<Path>

type Entry = {
  send: AnyPacket
  revert?: AnyPacket
}

let staging: Entry[] = []

function reverse(map: Map, pkt: AnyPacket): AnyPacket {
  throw 'todo'
}

function send(send: AnyPacket) {
  const map = get(rmap).map
  const revert = reverse(map, send)
  staging.push({ send, revert })
}

function resp(resp: RespPacket<SendKey>) {
  if (staging.length === 0 || staging[0].send.id !== resp.id) {
    console.error('unexpected packet response', resp)
    console.info('staging', staging)
    return
  }

  const sent = staging.shift()

  if ('err' in resp) {
    for (let i = staging.length - 1; i >= 0; --i) {
      const x = staging[i]
      if (x.revert !== undefined) {
        await server.query(x.revert)
      }
      else {
        console.error('cannot revert', x)
      }
    }
    staging = []
  }
}
>>>>>>> Stashed changes

<<<<<<< Updated upstream
// function commit(id: number) {
||||||| Stash base
function commit(id: number) {
=======
function recv(recv: RecvPacket<RecvKey>) {
  if ()
}

type Key = SendKey | RecvKey

// function action(key: Key) {
//   const getKeys: Key[] = [
//     "map/get/users",
//     "map/get/cursors",
//     "map/get/map",
//     "map/get/images",
//     "map/get/image",
//     "map/get/envelopes",
//     "map/get/envelope",
//     "map/get/groups",
//     "map/get/group",
//     "map/get/layers",
//     "map/get/layer",
//     "map/get/tiles",
//     "map/get/quad",
//     "map/get/automappers",
//     "map/get/automapper",
//     "get/map",
//   ]
//   const createKeys: Key[] = [
//     "map/put/image",
//     "map/put/envelope",
//     "map/put/group",
//     "map/put/layer",
//     "map/put/quad",
//     "map/put/automapper",
//     "put/map",
//   ]
//   const editKeys: Key[] = [
//     "map/post/config",
//     "map/post/info",
//     "map/post/envelope",
//     "map/post/group",
//     "map/post/layer",
//     "map/post/tiles",
//     "map/post/quad",
//     "map/post/automap",
//     "map/cursor",
//     "post/map",
//   ]
//   const reorderKeys: Key[] = [
//     "map/patch/envelope",
//     "map/patch/group",
//     "map/patch/layer",
//     "map/patch/quad",
//   ]
//   const deleteKeys: Key[] = [
//     "map/delete/image",
//     "map/delete/envelope",
//     "map/delete/group",
//     "map/delete/layer",
//     "map/delete/quad",
//     "map/delete/automapper",
//     "delete/map",
//   ]
>>>>>>> Stashed changes
  
<<<<<<< Updated upstream
// }
||||||| Stash base
}
=======
//   if (getKeys.includes(key))
//     return Action.Get
//   else if (createKeys.includes(key))
//     return Action.Create
//   else if (editKeys.includes(key))
//     return Action.Edit
//   else if (reorderKeys.includes(key))
//     return Action.Move
//   else if (deleteKeys.includes(key))
//     return Action.Delete
//   else
//     return Action.Other
// }
>>>>>>> Stashed changes

// whether received packet invalidates sent packet before server response.
// in that case, the sent packet needs to be reverted.
// function hasConflict(recv: RecvPacket<RecvKey>, sent: SendPacket<SendKey>) {
//   const recvAction = action(recv.type)
//   const sentAction = action(sent.type)
// }
