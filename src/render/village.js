// 人の道の背景（2026-11-08）: 川辺から霊鷲山へ登る道の景色。部屋の scene で描き分ける（無ければ左隣の部屋のものを引き継ぐ。いちばん左は village）
//   画面の縦の列ごとに、その列の部屋の背景を選ぶ（部屋の境目で切り替わる。餓鬼の道の src/render/town.js と同じ作り）
//   空の帯 → 遠くの景色（far。ゆっくり流れる）→ 近くの景色（near。少し速く流れる）の順に描く。
//   高さ: 地図のいちばん下からどれだけ登ったか（rise）で、遠くの景色（地平）と空の帯を下げる（登るほど地平が下がり、空が広く、下の平野が遠くなる）。
//     近くの景色は、いる部屋の底からどれだけ登ったかで下げる（三画面の高さの部屋を登ると、近くの景色は足もとへ沈んでいく）
//   絵は Pixel の human/<scene> の far（320 × 80。下の端が地平）と near（320 × 120。下の端が画面の下の端）。左右の端がつながる。
//     透明（.）は後ろが見える。無いうちは、コードで仮の景色を描く
//   village  川辺の村: 朝の淡い空。遠くにヤシと村の屋根、近くに藁ぶきの家と土塀
//   ford     渡し瀬・段々の田: 遠くに向こう岸の林と村、近くに葦と石段の岸（2026-11-10 に段々の田の paddies をやめて、ford にした）
//   hillside 坂の村: 遠くに下の平野と田、近くに斜面に並ぶ家
//   bamboo   竹林の崖: 遠くに山並み、近くに竹（細く高い幹と節、葉）
//   peak     霊鷲山: 遠くに霞む王舎城の盆地と五つの山、近くに岩がちな峰
import { P } from '../palette.js'
import { ART } from '../art.js'
import { TILE } from '../world.js'
import { W, H, hash } from './base.js'
import { makeHaze } from './haze.js'

// bands: 空の帯（[y, 色]。rise で下がる）、hill: 仮の遠くの山の色 [本体, 縁]、near: 仮の近くの景色の色
const SCENES = {
  village: { bands: [[0, P.bl5], [110, P.ye3], [165, P.gr6]], hill: [P.sg1, P.gr6], near: [P.gr4, P.gr3, P.br4, P.sa2] },
  ford: { bands: [[0, P.bl5], [105, P.bg3], [160, P.wt3]], hill: [P.sg2, P.sg1], near: [P.gr4, P.gr3, P.st2, P.wt3] },
  hillside: { bands: [[0, P.bl4], [95, P.bl5], [155, P.bg2]], hill: [P.sg2, P.sg1], near: [P.br4, P.sa2, P.rd1, P.gr4] },
  bamboo: { bands: [[0, P.bl4], [90, P.tl3], [150, P.gr6]], hill: [P.sg2, P.gr6], near: [P.gr3, P.gr4, P.gr5, P.gr2] },
  peak: { bands: [[0, P.bl3], [80, P.bl4], [140, P.bl5]], hill: [P.lv2, P.lv1], near: [P.st2, P.st1, P.gy4, P.br3] },
}
export const VILLAGE_SCENES = Object.keys(SCENES)
const FAR_Y = 156, FAR_RISE = 0.12, NEAR_RISE = 0.35, NEAR_HAZE = 0.35

export function makeVillageSky({ fb, px: rawPx, tint: rawTint }) {
  const haze = makeHaze(rawPx, rawTint), { px, tint } = haze   // 白いかすみは、切り貼りのあとで重ねる（src/render/haze.js）
  // Pixel の層: human/<scene> の far・near。下の端を bottom にそろえ、横にくり返して par の割合でずらす。haze: 白をうっすら重ねる
  const layer = (name, which, camX, par, bottom, haze = 0) => {
    const a = ART[`human/${name}`], rows = a?.pics?.[which]
    if (!rows) return false
    const w = rows[0].length, h = rows.length, top = Math.round(bottom) - h, off = ((Math.floor(camX * par) % w) + w) % w
    for (let j = 0; j < h; j++) {
      const y = top + j
      if (y < 0 || y >= H) continue
      const row = rows[j]
      for (let x = 0; x < W; x++) {
        const ch = row[(x + off) % w]
        if (ch === '.' || ch == null || a.colors[ch] == null) continue
        px(x, y, a.colors[ch])
        if (haze && tint) tint(x, y, P.white, haze)
      }
    }
    return true
  }
  const sky = (S, shift) => {
    for (let y = 0; y < H; y++) {
      let c = S.bands[0][1], c2 = null
      for (let k = 0; k < S.bands.length; k++) {
        const by = S.bands[k][0] + (k ? shift : 0)
        if (y >= by) c = S.bands[k][1]
        if (k + 1 < S.bands.length && y >= S.bands[k + 1][0] + shift - 12 && y < S.bands[k + 1][0] + shift) c2 = S.bands[k + 1][1]
      }
      for (let x = 0; x < W; x++) fb[y * W + x] = c2 != null && (x + y) % 2 === 0 ? c2 : c
    }
  }
  // 仮の遠くの景色: なだらかな山並み（peak は五つの山の連なり）
  const farHills = (name, S, camX, bottom) => {
    const peak = name === 'peak'
    for (let x = 0; x < W; x++) {
      const wx = x + camX * 0.2
      const hgt = peak ? Math.round(30 + Math.abs(Math.sin(wx * 0.011)) * 34 + Math.sin(wx * 0.047) * 5) : Math.round(14 + Math.sin(wx * 0.013) * 9 + Math.sin(wx * 0.041) * 4)
      for (let y = Math.round(bottom) - hgt; y < Math.round(bottom); y++) px(x, y, y < bottom - hgt + 2 ? S.hill[1] : S.hill[0])
    }
    // 地平より下（平野）は、空の帯の最後の色をうっすら
    for (let y = Math.round(bottom); y < H; y++) for (let x = 0; x < W; x++) if ((x + y) % 2 === 0) px(x, y, S.hill[0])
  }
  // 仮の近くの景色（景色ごとに一つの形）
  const nearPlaceholder = (name, S, camX, bottom, t) => {
    const off = camX * 0.45, b = Math.round(bottom)
    if (name === 'bamboo') {   // 竹: 細い幹が並び、節と葉
      for (let i = -1; i < 16; i++) {
        const x0 = Math.round(i * 24 - (off % 24)) + Math.floor(hash(i + Math.floor(off / 24), 31) * 10), c = S.near[i & 1]
        for (let y = b - 120; y < b; y++) { px(x0, y, c); px(x0 + 1, y, c); if ((y - b) % 18 === 0) px(x0 + 2, y, S.near[3]) }
        for (let k = 0; k < 4; k++) { const ly = b - 110 + k * 26 + Math.floor(hash(i, k, 32) * 8); for (let d = 1; d < 7; d++) px(x0 + 1 + d, ly + (d >> 1), S.near[2]) }
      }
      return
    }
    if (name === 'peak') {   // 岩がちな峰
      for (let x = 0; x < W; x++) { const wx = x + off, hgt = Math.round(40 + Math.sin(wx * 0.03) * 16 + (hash(Math.floor(wx / 6), 33) - 0.5) * 6); for (let y = b - hgt; y < b; y++) px(x, y, y < b - hgt + 2 ? S.near[2] : (Math.floor(wx / 6) + y) % 7 === 0 ? S.near[1] : S.near[0]) }
      return
    }
    if (name === 'ford') {   // 川面と葦
      for (let y = b - 36; y < b; y++) for (let x = 0; x < W; x++) px(x, y, (x + Math.floor(off) + y * 3) % 23 === 0 ? P.white : S.near[3])
      for (let i = 0; i < 40; i++) { const x0 = Math.round(((i * 13 + hash(i, 34) * 9 - off) % 340 + 340) % 340) - 10; for (let y = b - 30 - Math.floor(hash(i, 35) * 10); y < b; y++) px(x0, y, S.near[i & 1]) }
      return
    }
    // village・hillside: 藁ぶき・瓦の小さな家（hillside は斜面に段々）
    for (let i = -1; i < 9; i++) {
      const step = 46, x0 = Math.round(i * step - (off % step)), j = i + Math.floor(off / step), w = 24 + Math.floor(hash(j, 36) * 10)
      const lift = name === 'hillside' ? (((j % 4) + 4) % 4) * 10 : 0, top = b - 26 - lift
      for (let y = top; y < b; y++) for (let x = x0; x < x0 + w; x++) px(x, y, S.near[3])
      for (let y = top - 9; y < top; y++) for (let x = x0 - 3; x < x0 + w + 3; x++) if (Math.abs(x - x0 - w / 2) <= (y - top + 10) * (w / 18)) px(x, y, S.near[2])
    }
  }

  const sceneCache = new WeakMap()
  const roomScenes = (world) => {
    const sig = world.rooms.map((r) => r.scene || '').join(',')
    let m = sceneCache.get(world)
    if (m && m.sig === sig) return m
    m = new Map(); m.sig = sig
    const rooms = world.rooms.slice().sort((a, b) => a.x - b.x || a.y - b.y)
    for (const r of rooms) {
      let sc = r.scene
      if (!sc) { const left = rooms.filter((q) => q.x + q.w <= r.x && m.get(q.index)).sort((a, b) => b.x + b.w - (a.x + a.w) || Math.abs(a.y - r.y) - Math.abs(b.y - r.y))[0]; sc = left ? m.get(left.index) : 'village' }
      m.set(r.index, SCENES[sc] ? sc : 'village')
    }
    m.ground = Math.max(...world.rooms.map((r) => (r.y + r.h) * TILE - H))   // いちばん下の部屋の底にいるときのカメラの高さ
    sceneCache.set(world, m)
    return m
  }

  const drawScene = (name, camX, camY, t, rise, nearRise) => {
    const S = SCENES[name], shift = Math.round(rise * FAR_RISE)
    sky(S, shift)
    const farBottom = FAR_Y + shift
    if (!layer(name, 'far', camX, 0.2, farBottom)) farHills(name, S, camX, farBottom)
    const nearBottom = H + nearRise * NEAR_RISE
    if (nearBottom - 120 < H && !layer(name, 'near', camX, 0.45, nearBottom, NEAR_HAZE)) nearPlaceholder(name, S, camX, nearBottom, t)
  }

  // 背景を描く（空より手前、岩のタイルより奥）
  const drawVillageSky = (world, camX, camY, t) => {
    haze.reset()
    const m = roomScenes(world)
    const rise = Math.max(0, m.ground - camY)
    const cx = Math.floor((camX + W / 2) / TILE), ty = Math.floor((camY + H / 2) / TILE)
    const ri = cx >= 0 && ty >= 0 && cx < world.w && ty < world.h ? world.roomOf[ty * world.w + cx] : -1, room = ri >= 0 ? world.rooms[ri] : null
    const nearRise = room ? Math.max(0, (room.y + room.h) * TILE - H - camY) : 0   // いる部屋の底からどれだけ登ったか
    const cols = new Array(W)
    let last = 'village'
    for (let x = 0; x < W; x++) {
      const tx = Math.floor((camX + x) / TILE), r = tx >= 0 && ty >= 0 && tx < world.w && ty < world.h ? world.roomOf[ty * world.w + tx] : -1
      cols[x] = r >= 0 ? m.get(r) : last
      last = cols[x]
    }
    const names = [...new Set(cols)]
    if (names.length === 1) { drawScene(names[0], camX, camY, t, rise, nearRise); haze.apply(); return }
    const out = new fb.constructor(fb.length), outHaze = new Float32Array(fb.length)
    for (const nm of names) {
      drawScene(nm, camX, camY, t, rise, nearRise)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cols[x] === nm) { out[y * W + x] = fb[y * W + x]; outHaze[y * W + x] = haze.a[y * W + x] }
      haze.reset()
    }
    fb.set(out); haze.a.set(outHaze); haze.apply()
  }
  return { drawVillageSky }
}
