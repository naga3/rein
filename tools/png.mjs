// インデックスバッファを PNG にする（確認用）
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { ALL_HEX } from '../src/shade.js'

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}

export function writePng(path, fb, w, h, scale = 1) {
  const rgb = ALL_HEX.map((x) => [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)])
  const W = w * scale, H = h * scale
  const raw = Buffer.alloc((W * 3 + 1) * H)
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0
    for (let x = 0; x < W; x++) {
      const c = rgb[fb[((y / scale) | 0) * w + ((x / scale) | 0)]]
      const o = y * (W * 3 + 1) + 1 + x * 3
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8; ihdr[9] = 2
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]))
}
