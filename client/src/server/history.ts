import { ColorEnvelope, PositionEnvelope, SoundEnvelope } from '../twmap/envelope'
import { QuadsLayer } from '../twmap/quadsLayer'
import { AnyTilesLayer, TilesLayer } from '../twmap/tilesLayer'
import * as MapDir from '../twmap/mapdir'
import type * as Info from '../twmap/types'
import type { Map } from '../twmap/map'
import {
  colorToJson,
  coordToJson,
  curveTypeToString,
  resIndexToString,
  tilesToData,
  toFixedNum,
  uvToJson,
} from './convert'
import type {
  Recv,
  RecvKey,
  RecvPacket,
  Req,
  ReqKey,
  RespPacket,
  Send,
  SendKey,
  SendPacket,
  Tiles,
} from './protocol'
import { map } from '../ui/global'
import { get } from 'svelte/store'

function rev_edit_envelope(map: Map, ...[e, part]: Recv['edit/envelope']): Send['edit/envelope'] {
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
    } else if (env instanceof PositionEnvelope) {
      rev_part.points = env.points.map(p => ({
        time: p.time,
        content: {
          x: toFixedNum(p.content.x, 15),
          y: toFixedNum(p.content.y, 15),
          rotation: toFixedNum(p.content.rotation, 10),
        },
        type: curveTypeToString(p.type),
      }))
    } else if (env instanceof SoundEnvelope) {
      rev_part.points = env.points.map(p => ({
        time: p.time,
        content: toFixedNum(p.content, 10),
        type: curveTypeToString(p.type),
      }))
    }
  }

  return [e, rev_part]
}

function rev_edit_group(map: Map, ...[g, part]: Recv['edit/group']): Send['edit/group'] {
  const group = map.groups[g]
  const rev_part: typeof part = {}

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
  if ('clipping' in part) rev_part.clipping = group.clipping
  if ('clip' in part) {
    rev_part.clip = {
      x: toFixedNum(group.clipX, 5),
      y: toFixedNum(group.clipY, 5),
      w: toFixedNum(group.clipW, 5),
      h: toFixedNum(group.clipH, 5),
    }
  }
  if ('name' in part) rev_part.name = group.name

  return [g, rev_part]
}

function rev_edit_layer(map: Map, ...[g, l, part]: Recv['edit/layer']): Send['edit/layer'] {
  const layer = map.groups[g].layers[l]
  const rev_part: typeof part = { type: part.type }

  if ('detail' in part) rev_part.detail = layer.detail
  if ('name' in part) rev_part.name = layer.name

  if (layer instanceof TilesLayer && rev_part.type === MapDir.LayerKind.Tiles) {
    if ('color' in part) rev_part.color = layer.color
    if ('width' in part) rev_part.width = layer.width
    if ('height' in part) rev_part.height = layer.height
    if ('color_env' in part)
      rev_part.color_env =
        layer.colorEnv === null
          ? null
          : resIndexToString(map.envelopes.indexOf(layer.colorEnv), layer.colorEnv.name)
    if ('color_env_offset' in part) rev_part.color_env_offset = layer.colorEnvOffset
    if ('image' in part)
      rev_part.image =
        layer.image === null
          ? null
          : resIndexToString(map.images.indexOf(layer.image), layer.image.name)
    if ('automapper_config' in part) {
      rev_part.automapper_config = {
        config: layer.automapper.config === -1 ? null : layer.automapper.config,
        seed: layer.automapper.seed,
        automatic: layer.automapper.automatic,
      }
    }
  } else if (layer instanceof QuadsLayer && rev_part.type === MapDir.LayerKind.Quads) {
    if ('image' in part)
      rev_part.image =
        layer.image === null
          ? null
          : resIndexToString(map.images.indexOf(layer.image), layer.image.name)
  }

  return [g, l, rev_part]
}

function rev_edit_quad(map: Map, ...[g, l, q, part]: Recv['edit/quad']): Send['edit/quad'] {
  const quad = (map.groups[g].layers[l] as QuadsLayer).quads[q]
  const rev_part: typeof part = {
    corners: quad.points.slice(0, 4).map(p => coordToJson(p, 15)),
    position: coordToJson(quad.points[4], 15),
    colors: quad.colors,
    texture_coords: quad.texCoords.map(p => uvToJson(p, 10)),
    position_env:
      quad.posEnv === null
        ? null
        : resIndexToString(map.envelopes.indexOf(quad.posEnv), quad.posEnv.name),
    position_env_offset: quad.posEnvOffset,
    color_env:
      quad.colorEnv === null
        ? null
        : resIndexToString(map.envelopes.indexOf(quad.colorEnv), quad.colorEnv.name),
    color_env_offset: quad.colorEnvOffset,
  }

  return [g, l, q, rev_part]
}

function rev_edit_tiles(map: Map, ...[g, l, tiles]: Recv['edit/tiles']): Send['edit/tiles'] {
  const layer = map.groups[g].layers[l] as AnyTilesLayer<any>
  const cur_tiles: Info.AnyTile[] = []

  for (let j = tiles.y; j < tiles.y + tiles.h; j++) {
    for (let i = tiles.x; i < tiles.x + tiles.w; i++) {
      cur_tiles.push({ ...layer.getTile(i, j) })
    }
  }

  const rev_tiles: Tiles = {
    x: tiles.x,
    y: tiles.y,
    w: tiles.w,
    h: tiles.h,
    tiles: tilesToData(cur_tiles),
  }
  return [g, l, rev_tiles]
}

function rev_automap(map: Map, ...[g, l]: Recv['edit/automap']): Send['edit/tiles'] {
  const layer = map.groups[g].layers[l] as AnyTilesLayer<any>
  const cur_tiles: Info.AnyTile[] = []

  for (let j = 0; j < layer.height; j++) {
    for (let i = 0; i < layer.width; i++) {
      cur_tiles.push({ ...layer.getTile(i, j) })
    }
  }

  const rev_tiles: Tiles = {
    x: 0,
    y: 0,
    w: layer.width,
    h: layer.height,
    tiles: tilesToData(cur_tiles),
  }
  return [g, l, rev_tiles]
}

export function reverse(map: Map, pkt: SendPacket<ReqKey>): [ReqKey, Req[ReqKey]] | null {
  if (pkt.type === 'create/image') {
    const i = map.images.length
    return ['delete/image', i]
  } else if (pkt.type === 'create/envelope') {
    const e = map.envelopes.length
    return ['delete/envelope', e]
  } else if (pkt.type === 'create/group') {
    const g = map.groups.length
    return ['delete/group', g]
  } else if (pkt.type === 'create/layer') {
    const [g] = pkt.content as Send['create/layer']
    const l = map.groups[g].layers.length
    return ['delete/layer', [g, l]]
  } else if (pkt.type === 'create/quad') {
    const [g, l] = pkt.content as Send['create/quad']
    const q = (map.groups[g].layers[l] as QuadsLayer).quads.length
    return ['delete/quad', [g, l, q]]
  } else if (pkt.type === 'create/automapper') {
    return null // this is handled by codemirror
  }
  // TODO
  else if (pkt.type === 'edit/config') {
    return null
  } else if (pkt.type === 'edit/info') {
    const part = pkt.content as Send['edit/info']
    const rev_part = Object.fromEntries(Object.keys(part).map(k => [k, map.info[k]]))
    return ['edit/info', rev_part]
  } else if (pkt.type === 'edit/envelope') {
    const [e, part] = pkt.content as Send['edit/envelope']
    return ['edit/envelope', rev_edit_envelope(map, e, part)]
  } else if (pkt.type === 'edit/group') {
    const [g, part] = pkt.content as Send['edit/group']
    return ['edit/group', rev_edit_group(map, g, part)]
  } else if (pkt.type === 'edit/layer') {
    const [g, l, part] = pkt.content as Send['edit/layer']
    return ['edit/layer', rev_edit_layer(map, g, l, part)]
  } else if (pkt.type === 'edit/tiles') {
    const [g, l, tiles] = pkt.content as Send['edit/tiles']
    return ['edit/tiles', rev_edit_tiles(map, g, l, tiles)]
  } else if (pkt.type === 'edit/quad') {
    const [g, l, q, part] = pkt.content as Send['edit/quad']
    return ['edit/quad', rev_edit_quad(map, g, l, q, part)]
  } else if (pkt.type === 'edit/automap') {
    const [g, l] = pkt.content as Send['edit/automap']
    return ['edit/tiles', rev_automap(map, g, l)]
  } else if (pkt.type === 'move/envelope') {
    const [src, tgt] = pkt.content as Send['move/envelope']
    return ['move/envelope', [tgt, src]]
  } else if (pkt.type === 'move/group') {
    const [src, tgt] = pkt.content as Send['move/group']
    return ['move/group', [tgt, src]]
  } else if (pkt.type === 'move/layer') {
    const [src, tgt] = pkt.content as Send['move/layer']
    return ['move/layer', [tgt, src]]
  } else if (pkt.type === 'delete/image') {
    return null
  } else if (pkt.type === 'delete/envelope') {
    return null
  } else if (pkt.type === 'delete/group') {
    return null
  } else if (pkt.type === 'delete/layer') {
    return null
  } else if (pkt.type === 'delete/quad') {
    return null
  } else if (pkt.type === 'delete/automapper') {
    return null
  } else if (pkt.type === 'edit/map') {
    return null
  } else if (pkt.type === 'delete/map') {
    return null
  } else {
    const _exhaustive: never = pkt.type // typescript: ensure exhaustive check
    return _exhaustive
  }
}

const recvKeys: RecvKey[] = [
  'create/image',
  'create/envelope',
  'create/group',
  'create/layer',
  'create/quad',
  'create/automapper',
  'edit/config',
  'edit/info',
  'edit/envelope',
  'edit/group',
  'edit/layer',
  'edit/tiles',
  'edit/quad',
  'edit/automap',
  'move/envelope',
  'move/group',
  'move/layer',
  'delete/image',
  'delete/envelope',
  'delete/group',
  'delete/layer',
  'delete/quad',
  'delete/automapper',
  'map_created',
  'map_deleted',
  'users',
  'saved',
]

function isRequest(pkt: SendPacket<any> | RecvPacket<any>): pkt is SendPacket<ReqKey> {
  return recvKeys.includes(pkt.type)
}

type Op = [ReqKey, Req[ReqKey]]

interface Operation {
  id: number
  forward: Op
  reverse: Op
}

// COMBAK:
// I don't like how this couples with Server, and how it weirdly depends on Map.

export class History {
  history: Operation[] // tracks all undo/redo-able requests.
  pending: Operation[] // tracks all pending requests.
  maxLen: number
  index: number // points past last modification
  skip: number

  constructor() {
    this.history = []
    this.pending = []
    this.maxLen = 100
    this.index = 0
    this.skip = 0
  }

  clear() {
    this.history = []
    this.index = 0
  }

  send(pkt: SendPacket<SendKey>) {
    if (isRequest(pkt)) {
      const rev = reverse(get(map), pkt)
      if (rev === null) return

      const pending: Operation = {
        forward: [pkt.type, pkt.content],
        reverse: rev,
        id: pkt.id,
      }
      this.pending.push(pending)

      if (this.skip) {
        // skip push to history
        this.skip--
      } else if (this.index !== this.history.length) {
        // discard forward history and push pending
        this.history.splice(this.index, this.history.length, pending)
        this.index = this.history.length
      } else {
        this.history.push(pending)
        if (this.history.length > this.maxLen) {
          this.history.shift()
        }
        this.index = this.history.length
      }
    }
  }

  resp(pkt: RespPacket<SendKey>): Op[] | null {
    const index = this.pending.findIndex(p => p.id === pkt.id)
    if (index === -1) return null

    // note: because websocket is ordered, response must be for the 1st pending request.
    if (index !== 0) {
      console.error('unexpected response', pkt)
      return null
    }

    if ('err' in pkt) {
      // revert all till err packet, then redo all
      const rev = this.pending.map(p => p.reverse).reverse()
      const redo = this.pending.slice(1).map(p => p.forward)
      const pending = this.pending.shift()

      const index = this.history.findIndex(k => k === pending)
      if (index !== -1) {
        this.history.splice(index, 1)
        if (index < this.index) {
          this.index -= 1
        }
      }

      this.skip += rev.length + redo.length
      return [...rev, ...redo]
    } else {
      this.pending.shift()
    }

    return null
  }

  // returns the list of operations to dispatch upon receiving pkt
  recv(pkt: RecvPacket<RecvKey>): Op[] | null {
    if (isRequest(pkt)) {
      // TODO: for now, when another user sends a request, it prevents the user from
      // undoing at all.
      this.clear()

      // revert all pending, apply pkt and redo all pending
      if (this.pending.length) {
        const rev = this.pending.map(p => p.reverse).reverse()
        const redo = this.pending.map(p => p.forward)
        this.pending.shift()

        this.skip += rev.length + 1 + redo.length
        return [...rev, [pkt.type, pkt.content], ...redo]
      }
    }

    return null
  }

  undo(): Op | null {
    const pkt = this.history[this.index - 1]
    if (!pkt) return null

    this.index -= 1
    this.skip++ // mark to skip the next send
    return pkt.reverse
  }

  redo(): Op | null {
    const pkt = this.history[this.index]
    if (!pkt) return null

    this.index += 1
    this.skip++ // mark to skip the next send
    return pkt.forward
  }
}
