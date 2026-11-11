// 地図全体を一枚の画像にする（1 タイルを 3 ドット）: node tools/mapview.mjs out.png [地図の名前（hell・animal）]
import { buildWorld, K } from '../src/world.js'
import { MAPS } from '../src/maps.js'
import { P } from '../src/palette.js'
import { writePng } from './png.mjs'

const out = process.argv[2] || '/tmp/reincarnation-map.png'
const name = process.argv[3] || 'hell'
const w = buildWorld(MAPS[name], { strict: false, realm: name })
const S = 3
const W = w.w * S, H = w.h * S
const fb = new Uint8Array(W * H).fill(P.black)
const col = { [K.air]: P.gy1, [K.rock]: P.gy3, [K.fire]: P.or2, [K.spikeUp]: P.white, [K.spikeDown]: P.white, [K.spikeRight]: P.white, [K.spikeLeft]: P.white, [K.jet]: P.ye2, [K.hidden]: P.pk2, [K.door]: P.tl3, [K.fakeFire]: P.or2 }
if (name === 'animal') col[K.fire] = P.wt2   // 畜生では水
if (name === 'peta') col[K.fire] = P.rd2   // 餓鬼では血の川
if (name === 'human') col[K.fire] = P.wt2   // 人では川
for (let ty = 0; ty < w.h; ty++) for (let tx = 0; tx < w.w; tx++) {
  const i = ty * w.w + tx, ri = w.roomOf[i]
  let c = ri < 0 ? P.black : col[w.t[i]]
  if (ri >= 0 && w.rooms[ri].light && w.t[i] === K.air) c = P.bl4
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) fb[(ty * S + y) * W + tx * S + x] = c
}
// 部屋の境目
for (const r of w.rooms) for (let x = r.x * S; x < (r.x + r.w) * S; x++) { fb[r.y * S * W + x] = P.rd1; }
// 生き物（鳥は黄、魚は白、蛇は緑）
for (const c of w.creatures || []) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) fb[(c.ty * S + y) * W + c.tx * S + x] = { bird: P.ye3, fish: P.white, snake: P.gr4 }[c.kind]
for (const r of w.rooms) for (let y = r.y * S; y < (r.y + r.h) * S; y++) { fb[y * W + r.x * S] = P.rd1 }
// 餓鬼の道: 布施人は黄緑、熱い風は橙、食べ物は黄、町の人は白（2026-11-07）
const dot = (tx, ty, c) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) fb[(ty * S + y) * W + tx * S + x] = c }
for (const d of w.donors || []) dot(d.tx, d.ty, P.lime)
for (const b of w.winds || []) dot(b.tx, b.ty, P.or1)
for (const f of w.foods || []) dot(f.tx, f.ty, P.ye2)
for (const f of w.folk || []) dot(f.tx, f.ty, P.white)
const sx = Math.floor(w.start.x / 16), sy = Math.floor(w.start.y / 16) - 1
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) fb[(sy * S + y) * W + sx * S + x] = P.gr4
writePng(out, fb, W, H, 1)
console.log('wrote', out, W, 'x', H)
