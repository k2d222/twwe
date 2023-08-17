// Implementation taken from ddnet client.

import md5 from 'js-md5'

export type UUID = Uint8Array // an uuid is 16 bytes.

const TEEWORLDS_NAMESPACE = new Uint8Array([
  // "e05ddaaa-c4e6-4cfb-b642-5d48e80c0029"
  0xe0, 0x5d, 0xda, 0xaa, 0xc4, 0xe6, 0x4c, 0xfb, 0xb6, 0x42, 0x5d, 0x48, 0xe8, 0x0c, 0x00, 0x29,
])

export function fromString(str: string): UUID {
  const hash = md5.create()
  hash.update(TEEWORLDS_NAMESPACE)
  hash.update(str)
  const result = new Uint8Array(hash.arrayBuffer())

  result[6] &= 0x0f
  result[6] |= 0x30
  result[8] &= 0x3f
  result[8] |= 0x80

  return result
}

export function compare(a: UUID, b: UUID): boolean {
  return a.every((x, i) => x === b[i])
}
