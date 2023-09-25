import { ColorEnvelope, PositionEnvelope, SoundEnvelope } from 'src/twmap/envelope'
import { QuadsLayer } from 'src/twmap/quadsLayer'
import { TilesLayer } from 'src/twmap/tilesLayer'
import * as MapDir from '../twmap/mapdir'
import type { Map } from '../twmap/map'
import { colorToJson, coordToJson, curveTypeToString, resIndexToString, toFixedNum, uvToJson } from './convert'
import type { Recv, RecvKey, Send, SendKey, SendPacket } from './protocol'

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

function rev_post_group(map: Map, ...[g, part]: Recv['map/post/group']): Send['map/post/group'] {
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

function rev_post_layer(map: Map, ...[g, l, part]: Recv['map/post/layer']): Send['map/post/layer'] {
  const layer = map.groups[g].layers[l]
  const rev_part: typeof part = { type: part.type }

  if ('detail' in part)
    rev_part.detail = layer.detail
  if ('name' in part)
    rev_part.name = layer.name

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

function commit(id: number) {
  
}

