#!/usr/bin/env node
// 自動のテストプレイ: 足場から足場へ、歩く・ダッシュ（押す長さ・押したまま曲げる・二回目）の組み合わせを本物の動き（src/player.js）で試し、
// はじまりから各光の部屋へ届くか、どれだけ精度が要るかを測る
//   node tools/solve.mjs [--map 道]            全部の光の部屋と、本筋の最後の部屋（道: hell・animal・peta・human・human2。無ければ hell）
//   node tools/solve.mjs --path 5   光の部屋（地図の部屋の番号）までの道を表示
//   道ごとの決まり: 畜生の生き物（鳥・魚・蛇）は時間で動くので、炎と同じく出る時を変えて試す。
//   人は、施す食べ物（G）を拾ってから僧のいる部屋までを、ダッシュ無しで調べる（運ぶ間にダッシュするか、3 マス以上落ちるとこぼれる。結んだ光の部屋〈gifts の link〉へだけ。盆の傾き・崩れる岩（固い岩として見る）・転がる岩は見ていない）。
//   再び人（human2）は、誘うもの（T）に触れたら失敗として、はじまりから終わりの部屋まで（一周を触れずに歩き通せるか）
//   餓鬼（peta）は、布施人（Y）ごとに、どの光の部屋（donor）まで連れて行けるかも調べる（donorReport。布施人の動きは src/donor.js をそのまま使う）
// 難しさ: 道の中でいちばん難しい一歩の「余裕の幅（コマ）」。6 以上は気楽、3〜5 は慣れが要る、1〜2 はかなりの精度が要る
// すり抜けの岩は開いているものとして調べる（見つけたあと）。扉は閉じている（光の部屋から帰る道は別に調べる）
import { buildWorld, TILE, K, deadly, roomAt, openHidden, openDoorsOf, isSolidKind, tileAt, JET, DONOR } from '../src/world.js'
import { moveDonor } from '../src/donor.js'
import { MAPS } from '../src/maps.js'
import { REALMS, lightLabel } from '../src/realms.js'
import { createPlayer, stepPlayer, hurtBox, enterAbove } from '../src/player.js'
import { DEFAULTS as T } from '../src/tune.js'

const args = process.argv.slice(2)
const REALM = args.includes('--map') ? args[args.indexOf('--map') + 1] : 'hell'
const ROOMS = MAPS[REALM]
const DT = 1 / 60
const world = buildWorld(ROOMS, { realm: REALM })
world.hiddenGroups.forEach((_, gi) => openHidden(world, gi))
const lightRooms = world.rooms.filter((r) => r.light)
// 本筋: 光の部屋でも、そこへ行くだけのつなぎでもない部屋。つなぎ = 光の部屋のほかに、本筋の部屋一つとしか面していない部屋
const touches = (A, B) => A !== B && !(B.x > A.x + A.w || B.x + B.w < A.x || B.y > A.y + A.h || B.y + B.h < A.y) && !((B.x === A.x + A.w || B.x + B.w === A.x) && (B.y === A.y + A.h || B.y + B.h === A.y))
const lightNear = (A) => world.rooms.some((B) => B.light && touches(A, B))
const leftmost = Math.min(...world.rooms.filter((r) => !r.light).map((r) => r.x)), rightmost = Math.max(...world.rooms.filter((r) => !r.light && !r.end).map((r) => r.x + r.w))
const mainNames = world.rooms.filter((r) => !r.light && (!(lightNear(r) && world.rooms.filter((B) => !B.light && touches(r, B)).length <= 1) || r.x === leftmost || r.x + r.w === rightmost || r.end)).map((r) => r.name)
const lastMainRoom = world.rooms.find((r) => r.end) || world.rooms.filter((r) => mainNames.includes(r.name)).sort((a, b) => b.x + b.w - (a.x + a.w))[0]
if (!args.includes("--quiet")) console.log(`本筋: ${mainNames.join("・")}（最後: ${lastMainRoom.name}）`)
const TEMPT_FAIL = REALM === 'human2'   // 再び人: 誘うものに触れたら、その跳び方は失敗
let NO_DASH = false                      // 人の道: 施す食べ物を運んでいる間

const standing = (w, x, y) => {
  const p = createPlayer(x, y)
  p.onGround = true
  stepPlayer(p, w, { x: 0, y: 0, dash: false, dashPressed: false }, T, DT)
  return p.onGround && Math.abs(p.y - y) < 0.5 && Math.abs(p.x - x) < 0.5
}

// 一つの跳び方を試す。m: { x0, dir, pre, hold, dj, dashF, dashD:[dx,dy], phase, walk }
function run(w, sx, sy, m, ignoreLight = -1) {
  const p = createPlayer(m.x0, sy)
  p.onGround = true
  p.noGrab = NO_DASH   // 運ぶ間は角につかまれない
  let t = m.phase, left = false, touched = null, inRoom = roomAt(w, p.x, p.y - 8)
  let topY = p.y   // 運ぶ間: 宙にいる間のいちばん高い所（3 マス以上落ちて着くと、こぼれる。src/game.js の SPILL_FALL）
  for (let f = 0; f < 200; f++) {
    let inp
    if (m.walk) inp = { x: f < m.walk ? m.dir : 0, y: 0, dash: false, dashPressed: false }
    else {
      // 歩く向きはずっと。dashF コマ目に押して h1 コマ押し続ける（向き d1。[0, 0] は真上）。
      //   二つ目: steer なら、押したまま s2 コマ目から向きを d2 に（曲げる）。press なら、s2 コマ目にもう一度押して h2 コマ（向き d2）
      const g = f - m.dashF, second = m.k2 && g >= m.s2
      const cur = second ? m.d2 : m.d1
      const held = (g >= 0 && g < m.h1) || (m.k2 === 'press' && g >= m.s2 && g < m.s2 + m.h2)
      const pressed = g === 0 || (m.k2 === 'press' && g === m.s2)
      inp = g >= 0 ? { x: cur[0], y: cur[1], dash: held, dashPressed: pressed } : { x: m.dir, y: 0, dash: false, dashPressed: false }
    }
    if (NO_DASH) inp.dashPressed = false
    stepPlayer(p, w, inp, T, DT)
    t += DT
    if (deadly(w, hurtBox(p), t) || p.y > w.h * TILE) return null
    if (TEMPT_FAIL) { const b = hurtBox(p); if (w.tempts.some((tm) => b.l < tm.x + 6 && b.r > tm.x - 6 && b.b > tm.y - 12 && b.t < tm.y)) return null }
    const r = roomAt(w, p.x, p.y - 8)
    if (r && r !== inRoom) { if (p.vy < 0 && inRoom && r.y + r.h <= inRoom.y) enterAbove(p, w, r, T); inRoom = r }   // ゲームと同じ押し上げ（src/game.js）
    if (r?.light && touched === null && r.index !== ignoreLight && ignoreLight !== -2) touched = r.index   // -2: どの光の部屋も素通り（帰り道）
    if (NO_DASH) { if (!p.onGround && !p.climb) topY = Math.min(topY, p.y); else { if (p.onGround && p.y - topY >= 3 * TILE) return null; topY = p.y } }
    if (!p.onGround) left = true
    if (p.onGround && !p.climb && (left || (m.walk && f >= m.walk))) {
      if (m.walk && !left && f < m.walk + 2) continue
      return { tx: Math.floor(p.x / TILE), ty: Math.round(p.y / TILE), x: p.x, touched, frames: f }
    }
  }
  return null
}

// 跳び方の候補。地図全体は粗く（速い）、寄り道だけを調べるとき（--local）と --fine は細かく
const FINE = args.includes('--local') || args.includes('--fine')
const MACROS = []
// 歩く、ダッシュ一回、ダッシュして曲げる、ダッシュ二回（向き無しで押すのは真上と同じなので、真上で代える）
//   ダッシュは押す長さ 4 コマ（すぐ離す）か、ずっと
const D8 = [[1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1], [1, 1], [-1, 1], [0, 1]]
const firsts = D8.slice(0, 7).flatMap((d) => [{ d, h: 4 }, { d, h: 99 }])
const presses = D8.map((d) => ({ d, h: 99 }))
for (const dir of [-1, 0, 1]) {
  if (dir) for (const walk of [8, 18, 34]) MACROS.push({ dir, walk })
  for (const pre of dir ? (FINE ? [0, 6, 14] : [0, 10]) : [0]) for (const a of firsts) {
    const base = { dir, dashF: pre, d1: a.d, h1: a.h, k2: null, s2: -1 }
    MACROS.push(base)
    if (a.h === 99) for (const s2 of FINE ? [4, 7, 11] : [6]) for (const d2 of D8) MACROS.push({ ...base, k2: 'steer', s2, d2 })
    for (const s2 of FINE ? [12, 18, 26] : [16, 26]) for (const b of presses) MACROS.push({ ...base, k2: 'press', s2, d2: b.d, h2: b.h })
  }
}
// 時間で動くもの（噴き出す炎、畜生の生き物）の近く: 出る時を変えて試す
const nearJet = (sx, sy) => [...world.jets, ...world.creatures].some((j) => Math.abs((j.x ?? j.tx) * TILE - sx) < 14 * TILE && Math.abs((j.y ?? j.ty) * TILE - sy) < 10 * TILE)

// 余裕の幅（コマ）: タイミングと立ち位置を 1 コマずつずらして、成功し続ける幅。いちばん狭いもの
// 立ち位置はドットで測り、走る速さで割ってコマにする
function robustness(w, sx, sy, m, goal, ignoreLight = -1) {
  const ok = (v) => { const r = run(w, sx, sy, v, ignoreLight); return !!(r && goal(r)) }
  const span = (make, lo, hi) => {
    let a = 0, b = 0
    while (a > lo && ok(make(a - 1))) a--
    while (b < hi && ok(make(b + 1))) b++
    return b - a + 1
  }
  const wins = []
  wins.push(span((d) => ({ ...m, x0: m.x0 + d }), -12, 12) / (T.runMax / 60))
  if (m.walk) wins.push(span((d) => ({ ...m, walk: Math.max(1, m.walk + d) }), -8, 8))
  else {
    if (m.dir && m.dashF > 0) wins.push(span((d) => ({ ...m, dashF: Math.max(0, m.dashF + d) }), -8, 8))
    if (m.k2) wins.push(span((d) => ({ ...m, s2: Math.max(1, m.s2 + d) }), -6, 8))
    if (m.h1 > 0 && m.h1 < 99) wins.push(span((d) => ({ ...m, h1: Math.max(1, m.h1 + d) }), -3, 3))
  }
  if (nearJet(sx, sy)) wins.push(span((d) => ({ ...m, phase: m.phase + d * DT }), -40, 40) / 4)   // 炎の周期は、待てばよいので 4 で割る
  return Math.min(...wins)
}

// 足場の点（タイルの上）から、試す
function explore(w, startNodes, ignoreLight = -1, onlyRooms = null) {
  const nodes = new Map()    // key → { tx, ty, edges: [{ to, rob, m }], lights: [{ room, rob, m }] }
  const queue = []
  const add = (tx, ty) => { const k = `${tx},${ty}`; if (!nodes.has(k)) { nodes.set(k, { tx, ty, edges: [], lights: [] }); if (!onlyRooms || onlyRooms.has(roomAt(w, tx * TILE + 8, ty * TILE - 8)?.index)) queue.push(k) } return k }
  for (const [tx, ty] of startNodes) add(tx, ty)
  while (queue.length) {
    const key = queue.shift()
    const n = nodes.get(key)
    const sy = n.ty * TILE
    const xs = [n.tx * TILE + 8, n.tx * TILE + 3, n.tx * TILE + 13].filter((x) => standing(w, x, sy))
    if (!xs.length) continue
    const phases = nearJet(n.tx * TILE, sy) ? [0, JET.period / 3, (JET.period * 2) / 3] : [0]   // 炎の周期を 3 つに分けた時から試す
    // まず、どこへ着地できるかを集める（跳び方の候補）。そのあと、候補のうちいくつかだけ余裕の幅を測る
    const cands = new Map()
    for (const x0 of xs) for (const phase of phases) for (const mm of MACROS) {
      if (NO_DASH && mm.dashF >= 0) continue
      const m = { ...mm, x0, phase }
      const r = run(w, x0, sy, m, ignoreLight)
      if (!r) continue
      const tk = `${r.tx},${r.ty}`
      const goalKey = r.touched !== null ? `L${r.touched}` : tk
      if (goalKey === key) continue
      if (!cands.has(goalKey)) cands.set(goalKey, { list: [], to: tk, touched: r.touched })
      const c = cands.get(goalKey)
      if (c.list.length < 40) c.list.push(m)
    }
    for (const [gk, c] of cands) {
      const goal = c.touched !== null ? (q) => q.touched === c.touched : (q) => q.tx === Number(c.to.split(',')[0]) && q.ty === Number(c.to.split(',')[1])
      // 候補を間引いて（素直な跳び方を先に）、余裕の幅を測る
      const order = c.list.slice().sort((a, b) => cost(a) - cost(b))
      let best = null
      for (const m of order.slice(0, 6)) {
        const rob = robustness(w, m.x0, sy, m, goal, ignoreLight)
        if (!best || rob > best.rob) best = { rob, m }
        if (rob >= 8) break
      }
      if (c.touched !== null) n.lights.push({ room: c.touched, rob: best.rob, m: best.m })
      else { add(...c.to.split(',').map(Number)); n.edges.push({ to: c.to, rob: best.rob, m: best.m }) }
    }
  }
  return nodes
}
// 跳び方の手間（少ないほど素直）
const cost = (m) => m.walk ? 0 : 1 + (m.k2 ? 1 : 0) + (m.dashF ? 0.5 : 0) + (m.h1 < 99 ? 0.3 : 0)

// 一歩の成功の見込み: 余裕 8 コマ以上なら確実、それより狭ければ比例して下がる
export const W0 = 8
const pOf = (rob) => Math.max(0.03, Math.min(1, rob / W0))
// いちばん見込みの高い道（一歩ずつの見込みを掛け合わせる）。rob は「道の見込み」
function widest(nodes, startKey, extraSources = []) {
  const best = new Map([[startKey, { rob: 1, prev: null, hops: 0 }], ...extraSources.map((k) => [k, { rob: 1, prev: null, hops: 0 }])])
  const open = [startKey, ...extraSources]
  while (open.length) {
    open.sort((a, b) => best.get(b).rob - best.get(a).rob)
    const k = open.shift()
    const cur = best.get(k)
    for (const e of nodes.get(k)?.edges || []) {
      const rob = cur.rob * pOf(e.rob)
      const b = best.get(e.to)
      if (!b || rob > b.rob + 1e-9 || (Math.abs(rob - b.rob) < 1e-9 && cur.hops + 1 < b.hops)) { best.set(e.to, { rob, prev: k, hops: cur.hops + 1, e }); open.push(e.to) }
    }
  }
  return best
}

// 寄り道だけを調べる: --local 本筋の部屋の番号,寄り道の部屋の番号,…（最初の部屋の足場すべてから出発し、並べた部屋の中だけ調べる）
if (args.includes('--local')) {
  const ids = args[args.indexOf('--local') + 1].split(',').map(Number)
  const only = new Set(ids)
  const R0 = world.rooms[ids[0]]
  const t1 = Date.now()
  // 1. 本筋の部屋だけで、入口（左の端の近く）から出口（いちばん右の足場）までの道を求める。その道の足場を出発点にする
  const all = []
  for (let ty = R0.y; ty < R0.y + R0.h; ty++) for (let tx = R0.x; tx < R0.x + R0.w; tx++) if (tileAt(world, tx, ty) === K.air && isSolidKind(tileAt(world, tx, ty + 1)) && standing(world, tx * TILE + 8, (ty + 1) * TILE)) all.push([tx, ty + 1])
  const entry = all.filter(([tx]) => tx <= R0.x + 3)
  const mainNodes = explore(world, entry, -1, new Set([ids[0]]))
  const mw = widest(mainNodes, `${entry[0][0]},${entry[0][1]}`, entry.slice(1).map(([a, b]) => `${a},${b}`))
  let exitKey = null
  for (const [k] of mw) { const [tx, ty] = k.split(',').map(Number); if (roomAt(world, tx * TILE + 8, ty * TILE - 8) !== R0) continue; if (!exitKey || tx > Number(exitKey.split(',')[0])) exitKey = k }
  const route = []
  for (let k = exitKey; k; k = mw.get(k)?.prev) route.unshift(k)
  console.log(`本筋（${R0.name}）の入口から出口まで: 見込み ${(mw.get(exitKey).rob * 100).toFixed(0)}%`)
  // 2. その道の足場から、寄り道を調べる
  const starts = route.map((k) => k.split(',').map(Number))
  const nodes = explore(world, starts, -1, only)
  const keys = route
  const bw = widest(nodes, keys[0], keys.slice(1))
  const rn = (k) => { const [tx, ty] = k.split(',').map(Number); return roomAt(world, tx * TILE + 8, ty * TILE - 8)?.name ?? '?' }
  console.log(`足場 ${nodes.size}、${((Date.now() - t1) / 1000).toFixed(0)} 秒`)
  if (args.includes('--show')) for (const id of ids) { const R = world.rooms[id]; console.log(`  ${R.name}${R.light ? id : ''} の足場（部屋の中の座標）: ${[...nodes.keys()].filter((k) => rn(k) === R.name && (() => { const [tx, ty] = k.split(',').map(Number); return roomAt(world, tx * TILE + 8, ty * TILE - 8) === R })()).map((k) => { const [tx, ty] = k.split(',').map(Number); return `(${tx - R.x},${ty - R.y})` }).join(' ')}`) }
  for (const L of world.rooms.filter((r) => r.light && only.has(r.index))) {
    let b = null
    for (const [k, n] of nodes) for (const l of n.lights) if (l.room === L.index && bw.get(k)) { const rob = bw.get(k).rob * pOf(l.rob); if (!b || rob > b.rob) b = { rob, k, l } }
    console.log(`光 ${L.index}: ${b ? `見込み ${(b.rob * 100).toFixed(0)}%（${(1 / b.rob).toFixed(1)} 回）` : '届かない'}`)
    if (b) { let k = b.k; const out = []; while (k) { const v = bw.get(k); out.unshift(`${rn(k)} ${k}${v.e ? `（余裕 ${v.e.rob.toFixed(1)}）` : ''}`); k = v.prev } out.push(`光の部屋へ（余裕 ${b.l.rob.toFixed(1)}）`); console.log('   ' + out.join(' → ')) }
  }
  process.exit(0)
}
const t0 = Date.now()
if (args.includes('--return-only')) { returnOnly(); process.exit(0) }
const startKey = `${Math.floor(world.start.x / TILE)},${world.start.y / TILE}`
const nodes = explore(world, [startKey.split(',').map(Number)])
const best = widest(nodes, startKey)
const roomName = (k) => { const [tx, ty] = k.split(',').map(Number); return roomAt(world, tx * TILE + 8, ty * TILE - 8)?.name ?? '?' }
const pathTo = (k) => { const out = []; while (k) { out.unshift(k); k = best.get(k)?.prev } return out }

console.log(`足場 ${nodes.size}、調べた時間 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`)
// 本筋の最後の部屋
const lastMain = lastMainRoom
let mainBest = null
for (const [k, b] of best) { const [tx, ty] = k.split(',').map(Number); if (roomAt(world, tx * TILE + 8, ty * TILE - 8) === lastMain && (!mainBest || b.rob > mainBest.rob)) mainBest = { k, ...b } }
console.log(`本筋の最後（${lastMain.name}）: ${mainBest ? `見込み ${(mainBest.rob * 100).toFixed(0)}%（${mainBest.hops} 歩）` : '届かない'}`)
if (!mainBest) { const seen = new Set([...best.keys()].map(roomName)); console.log('  届いた本筋の部屋: ' + mainNames.filter((n) => seen.has(n)).join('・')) }
// 本筋の道（はじまりから最後の部屋まで）。寄り道の難しさは、この道から測る
const mainPath = mainBest ? pathTo(mainBest.k) : [startKey]
{
  let worst = null
  for (const k of mainPath) { const e = best.get(k).e; if (e && (!worst || e.rob < worst.e.rob)) worst = { k, e } }
  if (worst) console.log(`  本筋でいちばん狭い一歩: ${roomName(worst.k)} の ${worst.k} へ（余裕 ${worst.e.rob.toFixed(1)}）`)
}
// 本筋の部屋ごとの見込み（その部屋の中の一歩を掛け合わせる）
{
  const per = new Map()
  for (const k of mainPath) {
    const e = best.get(k).e; if (!e) continue
    const [tx, ty] = k.split(',').map(Number), R = roomAt(world, tx * TILE + 8, ty * TILE - 8)
    const nm = R ? R.name + (R.w > 40 ? `[${Math.floor((tx - R.x) / 20)}]` : '') : '?'   // とても長い部屋（再び人）は一画面ずつ
    per.set(nm, (per.get(nm) ?? 1) * pOf(e.rob))
  }
  console.log('  部屋ごと: ' + [...per].map(([nm, v]) => `${nm} ${(v * 100).toFixed(0)}%`).join('、'))
}
const branch = widest(nodes, startKey, mainPath)
// 人の道: 施す食べ物の所から、ダッシュ無しで調べ直す（光の部屋へは、食べ物を持って行く）
let carryFrom = null
if (world.gifts.length) {
  NO_DASH = true
  const gnodes = world.gifts.map((g) => `${g.tx},${g.ty + 1}`).filter((k) => branch.get(k))
  const cn = explore(world, gnodes.map((k) => k.split(',').map(Number)))
  carryFrom = { nodes: cn, best: new Map(gnodes.map((g) => [g, widest(cn, g)])), target: new Map(world.gifts.map((g) => [`${g.tx},${g.ty + 1}`, g.target])) }
  NO_DASH = false
  console.log(`施す食べ物 ${world.gifts.length} のうち、本筋から拾いに行けるもの: ${gnodes.length}（${world.gifts.filter((g) => !branch.get(`${g.tx},${g.ty + 1}`)).map((g) => `${g.tx},${g.ty}`).join(' ') || 'すべて'}）`)
}
// 寄り道の道の中で、いちばん狭い一歩
const worstOn = (k) => { let w = null; while (k) { const v = branch.get(k); if (v?.e && (!w || v.e.rob < w.rob)) w = { rob: v.e.rob, k }; k = v?.prev } return w }
// 光の部屋
const report = []
for (const L of lightRooms) {
  let b = null
  if (carryFrom) {
    // 食べ物を拾うまで（ダッシュあり）× 運ぶ道（ダッシュ無し）
    for (const [g, gb] of carryFrom.best) for (const [k, n] of carryFrom.nodes) for (const l of n.lights) if (l.room === L.index && gb.get(k) && carryFrom.target.get(g) === L.index) {   // 結んだ光の部屋の僧だけが受け取る
      const rob = branch.get(g).rob * gb.get(k).rob * pOf(l.rob)
      if (!b || rob > b.rob) b = { rob, k, hops: gb.get(k).hops + 1, l, gift: g }
    }
  } else for (const [k, n] of nodes) for (const l of n.lights) if (l.room === L.index) {
    const bb = branch.get(k)
    if (!bb) continue
    const rob = bb.rob * pOf(l.rob)
    if (!b || rob > b.rob) b = { rob, k, hops: bb.hops + 1, l }
  }
  report.push({ L, b })
  const where = `(${L.x / 20},${L.y / 15})`
  const wo = b && !b.gift && worstOn(b.k)
  console.log(`光 ${lightLabel(REALM, L.no).padStart(4)}（部屋 ${String(L.index).padStart(2)}） ${where.padEnd(8)}: ${b ? `見込み ${String((b.rob * 100).toFixed(0)).padStart(3)}%（${(1 / b.rob).toFixed(1)} 回。${b.gift ? `食べ物 ${b.gift} から運んで ${b.hops} 歩。` : `本筋から ${b.hops} 歩。`}いちばん狭いのは ${wo && pOf(wo.rob) <= pOf(b.l.rob) ? roomName(wo.k) + ' の一歩（余裕 ' + wo.rob.toFixed(1) + '）' : '光の部屋へ入る一歩（余裕 ' + b.l.rob.toFixed(1) + '）'}）` : '届かない'}`)
  if (args.includes('--path') && Number(args[args.indexOf('--path') + 1]) === L.index && b) {
    const bp = (k) => { const out = []; while (k) { out.unshift(k); k = branch.get(k)?.prev } return out }
    for (const k of bp(b.gift ?? b.k)) { const e = branch.get(k).e; console.log(`   ${k} ${roomName(k)}${e ? `  ← ${JSON.stringify(e.m)} 余裕 ${e.rob.toFixed(1)}` : ''}`) }
    if (b.gift) {   // 運ぶ道（ダッシュ無し）
      const gb = carryFrom.best.get(b.gift), cp = (k) => { const out = []; while (k) { out.unshift(k); k = gb.get(k)?.prev } return out }
      console.log('   ここから運ぶ:')
      for (const k of cp(b.k)) { const e = gb.get(k).e; console.log(`   ${k} ${roomName(k)}${e ? `  ← ${JSON.stringify(e.m)} 余裕 ${e.rob.toFixed(1)}` : ''}`) }
    }
  }
}
if (world.donors.length) donorReport()
// 光の部屋から本筋へ戻る道（扉を開けて）
if (args.includes('--return')) returnOnly()

// 布施人を連れて行けるか（2026-11-07）: 布施人の立つ所を一つの状態として、餓鬼がどこにいるかで決まる動き
//   （左へ・右へ歩かせる。床の端で、下にいて落とす）を src/donor.js で動かし、たどれる所を広げる。
//   どの光の部屋（donor）まで行けるか、何歩か、落とす高さ（DONOR.uneasyY を越えると、下で待つ餓鬼が遠すぎて不安になる）、
//   餓鬼がそばに立てるか（本筋の探索で届いた足場の近くか）を出す
function donorReport() {
  const pk = new Set(nodes.keys())
  const petaNear = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.round(y / TILE); for (let d = -3; d <= 3; d++) if (pk.has(`${tx + d},${ty}`)) return true; return false }
  const sim = (s, side, below) => {
    const b = { x: s.x, y: s.y, vx: 0, vy: 0, dir: side, onGround: true }
    let stuck = 0, fallFrom = null, drop = 0, frames = 0
    for (let f = 0; f < 60 * 10; f++) {
      frames = f
      const blocked = moveDonor(b, world, side * DONOR.walk, below, true, DT)
      if (!b.onGround && fallFrom === null && b.vy > 0) fallFrom = b.y
      const landed = b.onGround && fallFrom !== null
      if (landed) { drop = Math.max(drop, b.y - fallFrom); fallFrom = null }
      const r = roomAt(world, b.x, b.y - 8)
      if (r?.light && r.donor && b.onGround) return { b, room: r.index, drop, frames }
      if (landed && below) break   // 落とすのは一段だけ
      if (b.y > world.h * TILE) return null
      if (blocked && b.onGround) { if (++stuck > 6) break } else stuck = 0
    }
    return b.onGround ? { b, room: -1, drop, frames } : null
  }
  const key = (b) => `${Math.round(b.x / 8)},${Math.round(b.y)}`
  for (const d of world.donors) {
    const home = roomAt(world, d.x, d.y - 8)
    console.log(`布施人 ${d.index}（${home?.name} の (${d.tx - home.x}, ${d.ty - home.y})）: 餓鬼が家の床に${petaNear(d.x, d.y) ? '立てる' : '立てない（気づかせられない）'}`)
    const start = { x: d.x, y: d.y }
    const seen = new Map([[key(start), { s: start, prev: null, how: null, drop: 0, steps: 0, sec: 0 }]])
    // よい道: 落とす高さ（その道でいちばん高い一回）が低いほど、同じなら手数が少ないほど（2026-11-08。前は手数だけで選び、途中の足場に一段ずつ降ろす道があっても、高く落とす道を出していた）
    const better = (a, b) => !b || a.drop < b.drop - 0.5 || (Math.abs(a.drop - b.drop) <= 0.5 && a.steps < b.steps)
    const queue = [key(start)], reached = new Map()
    let guard = 0
    while (queue.length && seen.size < 600 && guard++ < 6000) {
      const k = queue.shift(), cur = seen.get(k)
      for (const side of [-1, 1]) for (const below of [false, true]) {
        const r = sim(cur.s, side, below)
        if (!r) continue
        const how = `${side < 0 ? '左' : '右'}へ${below ? `落とす（${(r.drop / TILE).toFixed(1)} マス）` : '歩く'}`
        const v = { s: { x: r.b.x, y: r.b.y }, prev: k, how, drop: Math.max(cur.drop, below ? r.drop : 0), steps: cur.steps + 1, sec: cur.sec + r.frames / 60, ok: petaNear(r.b.x, r.b.y) || r.room >= 0 }
        if (r.room >= 0) { if (better(v, reached.get(r.room))) reached.set(r.room, v); continue }
        const nk = key(r.b)
        if (Math.abs(r.b.x - cur.s.x) < 2 && r.b.y === cur.s.y) continue
        if (!better(v, seen.get(nk))) continue
        seen.set(nk, v); queue.push(nk)
      }
    }
    const tgt = d.target >= 0 ? world.rooms[d.target] : null
    console.log(`  結ばれた光の部屋: ${tgt ? lightLabel(REALM, tgt.no) : `なし（${d.link ?? '結んでいない'}）`}${tgt && !reached.has(d.target) ? `　→ 連れて行けない（布施人の行ける所 ${seen.size}）` : ''}`)
    const others = [...reached.keys()].filter((ri) => ri !== d.target)
    if (others.length) console.log(`  抜け道（結ばれていない光の部屋へも行ける。そこでは施さない）: ${others.map((ri) => lightLabel(REALM, world.rooms[ri].no)).join('、')}`)
    for (const [ri, v] of reached) {
      if (ri !== d.target) continue
      const way = [v.how]; for (let k = v.prev; k && seen.get(k).how; k = seen.get(k).prev) way.unshift(seen.get(k).how)
      const warn = []
      if (v.drop > DONOR.uneasyY) warn.push(`落とす高さ ${(v.drop / TILE).toFixed(1)} マスが、見失わずに待てる高さ（${(DONOR.uneasyY / TILE).toFixed(1)} マス）を越える`)
      let k = v.prev; const bad = []; while (k) { const q = seen.get(k); if (q.how && !q.ok) bad.push(`${Math.floor(q.s.x / TILE)},${q.s.y / TILE}`); k = q.prev }
      if (bad.length) warn.push(`餓鬼がそばに立てない所を通る: ${bad.join(' ')}`)
      console.log(`  ${lightLabel(REALM, world.rooms[ri].no)} へ: ${v.steps} 手、歩く時間 ${v.sec.toFixed(1)} 秒（${way.join(' → ')}）${warn.length ? '\n    気になる所: ' + warn.join('、') : ''}`)
    }
  }
}
function returnOnly() {
  for (const L of lightRooms) {
    const w2 = buildWorld(ROOMS, { realm: REALM })
    w2.hiddenGroups.forEach((_, gi) => openHidden(w2, gi))
    openDoorsOf(w2, L.index)
    // 光の部屋の床の足場から
    const starts = []
    for (let ty = L.y; ty < L.y + L.h; ty++) for (let tx = L.x; tx < L.x + L.w; tx++) if (tileAt(w2, tx, ty) === K.air && isSolidKind(tileAt(w2, tx, ty + 1))) starts.push([tx, ty + 1])
    // 光の部屋と、となりの部屋（二つ先まで）だけを調べる
    const near = new Set([L.index])
    for (let step = 0; step < 2; step++) for (const ri of [...near]) { const A = w2.rooms[ri]; for (const B of w2.rooms) if (!(B.x > A.x + A.w || B.x + B.w < A.x || B.y > A.y + A.h || B.y + B.h < A.y)) near.add(B.index) }
    const n2 = explore(w2, starts.slice(0, 6), -2, near)
    let back = 0
    for (const s of starts.slice(0, 6)) {
      const bw = widest(n2, `${s[0]},${s[1]}`)
      for (const [k, v] of bw) { const [tx, ty] = k.split(',').map(Number); const nm = roomAt(w2, tx * TILE + 8, ty * TILE - 8)?.name; if (mainNames.includes(nm)) back = Math.max(back, v.rob) }
    }
    console.log(`光 ${lightLabel(REALM, L.no)} から本筋へ戻る: ${back ? `見込み ${(back * 100).toFixed(0)}%` : '戻れない'}`)
  }
}
// ある部屋の中で届いた足場: --nodes 部屋の名前
if (args.includes('--nodes')) {
  const nm = args[args.indexOf('--nodes') + 1]
  const R = world.rooms.find((r) => r.name === nm)
  const list = [...nodes.keys()].filter((k) => roomName(k) === nm).map((k) => { const [tx, ty] = k.split(',').map(Number); return `(${tx - R.x},${ty - R.y})` })
  console.log(`${nm} で届いた足場（部屋の中の座標。足の下のタイル）: ${list.join(' ') || 'なし'}`)
}
