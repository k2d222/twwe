// import { ColorEnvelope, PositionEnvelope, SoundEnvelope } from 'src/twmap/envelope'
// import { QuadsLayer } from 'src/twmap/quadsLayer'
// import { TilesLayer } from 'src/twmap/tilesLayer'
// import * as MapDir from '../twmap/mapdir'
// import type { Map } from '../twmap/map'
// import { colorToJson, coordToJson, curveTypeToString, resIndexToString, toFixedNum, uvToJson } from './convert'
// import type { Recv, RecvKey, Send, SendKey, SendPacket } from './protocol'

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

// function rev_post_group(map: Map, ...[g, part]: Recv['post/group']): Send['post/group'] {
//   const group = map.groups[g]
//   const rev_part: typeof part = {}

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

// function rev_post_layer(map: Map, ...[g, l, part]: Recv['post/layer']): Send['post/layer'] {
//   const layer = map.groups[g].layers[l]
//   const rev_part: typeof part = { type: part.type }

//   if ('detail' in part)
//     rev_part.detail = layer.detail
//   if ('name' in part)
//     rev_part.name = layer.name

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

// function commit(id: number) {
  
// }

