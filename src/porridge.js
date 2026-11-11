// 人の道の、器に入った乳粥（2026-11-08）。運ぶ間、器の中で揺れ、こぼれると塊で飛び出して床に落ちる
//   位置ベース流体（PBF）。しくみは fukusui（~/src/etc/fukusui。本人の作ったもの）の水を、320 × 240 のドットの大きさに小さくして、
//   粘りを強くした（とろみ）。こぼれるかどうかは game.js の決まり（盆の傾き・ダッシュ・落下）で決め、ここは見た目だけ
//   器の座標: 底の真ん中が (0, 0)、上が負。器の内側は、底の幅 18・縁の幅 24・深さ 5 ドット。
//   運ぶ間、縁を越えた粒はこぼれて（P.drops）床に落ちて消える（2026-11-08。見た目だけ。決まりは変えない）。こぼれるのは、盆の傾きが半分を越えたとき（leak）だけ、DRIP 秒に 1 粒、合わせて OUT_MAX 粒まで。ほかのときは、縁より上に見えない壁とふたを置いて止める（器が空にならないように。傾きの警告になるように）
//   運ぶ間の粒は器の座標で持つ（器が速く動いても置いて行かれない）。器の動きの加速は、逆向きの力として粒にかける（揺れ）。こぼれたら、ゲームの座標に移す
import { TILE, tileAt, isSolidKind } from './world.js'

const N = 20, R = 1.1, D = 2.5, HK = 6, G = 420, ITERS = 3, VISC = 0.08, SUB = 2, OUT_MAX = 6, DRIP = 0.25, DROP_G = 950, CLING = 0.14, DROP_KEEP = 0.35, DROP_AIR = 4   // VISC: 2026-11-08 に 0.3 から下げた（ちゃぷちゃぷ揺れて、縁からこぼれる）。粒の大きさは、半分×40・半分×80 も試して、水っぽく見えたので、この大きさに戻した
export const BOWL = { bottom: 9, rim: 12, depth: 5, maxAngle: 0.55 }   // maxAngle: 傾きが 1 のときの器の傾き（ラジアン）
const kw = (r) => { const q = 1 - r / HK; return q * q * q }
const kg = (r) => { const q = 1 - r / HK; return (-3 / HK) * q * q }
let RHO0 = 1
{ let s = 0; for (let j = -4; j <= 4; j++) for (let i = -6; i <= 6; i++) { const r = Math.hypot(D * (i + j / 2), D * 0.866 * j); if (r < HK) s += kw(r) } RHO0 = s }

// 器の壁（器の座標の線分 [ax, ay, bx, by, 太さ]）。guard: 運ぶ間だけの見えない壁とふた
const WALLS = [[-BOWL.bottom, 0, BOWL.bottom, 0, 1], [-BOWL.bottom, 0, -BOWL.rim, -BOWL.depth, 1], [BOWL.bottom, 0, BOWL.rim, -BOWL.depth, 1]]
const GUARD = [[-BOWL.rim, -BOWL.depth, -BOWL.rim, -12, 1], [BOWL.rim, -BOWL.depth, BOWL.rim, -12, 1], [-BOWL.rim, -12, BOWL.rim, -12, 1]]
const near = (ax, ay, bx, by, x, y) => { const abx = bx - ax, aby = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / (abx * abx + aby * aby))); return [ax + abx * t, ay + aby * t] }

// 器の姿勢 pose: { x, y（底の真ん中。ゲームの座標）, a（傾き。ラジアン） }
export function makePorridge(pose) {
  const ps = [], cols = 7
  for (let i = 0; i < N; i++) {
    const col = i % cols, row = (i / cols) | 0
    const lx = -(cols - 1) * D / 2 + col * D + (row % 2 ? D / 4 : -D / 4), ly = -R - 0.5 - row * D * 0.8
    ps.push({ x: lx, y: ly, px: lx, py: ly, vx: 0, vy: 0, grain: i % 9 === 4, life: 0 })
  }
  return { ps, drops: [], out: 0, pose: { ...pose }, vel: null, free: false }
}
export const toWorld = (c, lx, ly) => { const co = Math.cos(c.a), si = Math.sin(c.a); return [c.x + lx * co - ly * si, c.y + lx * si + ly * co] }

function collideBowl(p, segs) {
  let lx = p.x, ly = p.y
  for (const [ax, ay, bx, by, rad] of segs) {
    const [qx, qy] = near(ax, ay, bx, by, lx, ly)
    let vx = lx - qx, vy = ly - qy
    const d = Math.hypot(vx, vy), minD = rad + R
    if (d < minD) { if (d < 1e-6) { vx = 0; vy = -1 } else { vx /= d; vy /= d } lx = qx + vx * minD; ly = qy + vy * minD }
  }
  p.x = lx; p.y = ly
}
// こぼれた粒は、地図の岩の上で止まる
function collideWorld(p, world) {
  const solid = (x, y) => isSolidKind(tileAt(world, Math.floor(x / TILE), Math.floor(y / TILE)))
  if (solid(p.x, p.y + R)) { p.y = Math.floor((p.y + R) / TILE) * TILE - R; p.py = p.y; p.px = p.x - (p.x - p.px) * 0.3 }
}

// 一コマ進める。pose: 今の器の姿勢（運ぶ間。器についていく）、world: こぼれたあとの床
const ACC_MAX = 500, ACC_K = 0.5   // 器の加速は半分だけ伝える（落ちる間に粒が浮いてふたに張りつかない）。強くても ACC_MAX まで（部屋を移ったときの飛びなど）
export function stepPorridge(P, pose, dt, world, leak = false) {
  P.drip = Math.max(0, (P.drip ?? 0) - dt)
  const open = leak && P.out < OUT_MAX && P.drip <= 0
  const segs = P.free ? [] : open ? WALLS : [...WALLS, ...GUARD]
  // 重さ（運ぶ間は、器の座標での向き。器の加速の逆向きを足す）
  let gx = 0, gy = G
  if (!P.free && pose && dt > 0) {
    const vel = { x: (pose.x - P.pose.x) / dt, y: (pose.y - P.pose.y) / dt }
    let ax = P.vel ? ((vel.x - P.vel.x) / dt) * ACC_K : 0, ay = P.vel ? ((vel.y - P.vel.y) / dt) * ACC_K : 0
    const am = Math.hypot(ax, ay); if (am > ACC_MAX) { ax *= ACC_MAX / am; ay *= ACC_MAX / am }
    P.vel = vel; P.pose = { ...pose }
    const wx = -ax, wy = G - ay, co = Math.cos(pose.a), si = Math.sin(pose.a)
    gx = wx * co + wy * si; gy = -wx * si + wy * co
  }
  const h = dt / SUB
  for (let s = 0; s < SUB; s++) {
    const ps = P.ps
    for (const p of ps) { p.vx += gx * h; p.vy += gy * h; p.px = p.x; p.py = p.y; p.x += p.vx * h; p.y += p.vy * h }
    for (const p of ps) { p.nb = []; for (const q of ps) { if (q !== p && Math.abs(p.x - q.x) < HK && Math.abs(p.y - q.y) < HK && (p.x - q.x) ** 2 + (p.y - q.y) ** 2 < HK * HK) p.nb.push(q) } }
    for (let it = 0; it < ITERS; it++) {
      for (const p of ps) {
        let rho = 1, gx = 0, gy = 0, sq = 0
        for (const q of p.nb) { let dx = p.x - q.x, dy = p.y - q.y, r = Math.hypot(dx, dy); if (r < 1e-4) { dx = 1e-3; dy = 0; r = 1e-3 } rho += kw(r); const g = kg(r) / RHO0; gx += (g * dx) / r; gy += (g * dy) / r; sq += g * g }
        p.lam = -Math.max(0, rho / RHO0 - 1) / (sq + gx * gx + gy * gy + 0.01)
      }
      for (const p of ps) {
        let sx = 0, sy = 0
        for (const q of p.nb) { let dx = p.x - q.x, dy = p.y - q.y, r = Math.hypot(dx, dy); if (r < 1e-4) { dx = 1e-3; dy = 0; r = 1e-3 } const g = ((p.lam + q.lam) * kg(r)) / RHO0; sx += (g * dx) / r; sy += (g * dy) / r }
        p.dx = sx; p.dy = sy
      }
      for (const p of ps) { p.x += p.dx; p.y += p.dy; if (segs.length) collideBowl(p, segs); else if (world) collideWorld(p, world) }
    }
    for (const p of ps) { p.vx = (p.x - p.px) / h; p.vy = (p.y - p.py) / h }
    // 粘り（とろみ）: まわりの粒と速さをそろえる
    for (const p of ps) { let ax = 0, ay = 0; for (const q of p.nb) { const w = kw(Math.hypot(p.x - q.x, p.y - q.y)); ax += (q.vx - p.vx) * w; ay += (q.vy - p.vy) * w } p.ax = ax; p.ay = ay }
    for (const p of ps) { p.vx += VISC * p.ax; p.vy += VISC * p.ay; const v = Math.hypot(p.vx, p.vy); if (v > 400) { p.vx *= 400 / v; p.vy *= 400 / v } }
  }
  if (P.free) for (const p of P.ps) p.life += dt
  // 縁を越えた粒: 器から離して、ゲームの座標のこぼれた粒にする
  if (!P.free) {
    const c = P.pose
    P.ps = P.ps.filter((p) => {
      if (!outside(p)) return true   // 器の外に出た粒は、すぐこぼれた粒にする（前は 0.25 秒に 1 粒しか離さず、同じ時に縁を越えた 2 粒目が、器の外で器と一緒に飛び回っていた。2026-11-08）。こぼれる間（DRIP）と数（OUT_MAX）は、縁の上の見えない壁（open）で抑える
      const [x, y] = toWorld(c, p.x, p.y)
      // 縁を越えた粒は、まず器の外側を伝って垂れ（cling。器と一緒に動く）、器の底の横からしずくになって落ちる。
      //   落ちるときの横の速さは器の DROP_KEEP 倍で、空気で弱まる（器の速さを全部引き継ぐと、カメラが止まっている所で斜め下へ飛んで見え、
      //   全部捨てると、歩く人から見て後ろへ飛んで見えた。2026-11-08）
      const side = Math.sign(p.x) || 1
      P.drops.push({ x, y, vx: 0, vy: 0, side, cling: 0, grain: p.grain, life: 0 })
      P.out++; P.drip = DRIP
      return false
    })
  }
  // こぼれた粒: 落ちて、床で止まり、消える
  for (const d of P.drops) {
    d.life += dt
    if (d.landed) continue
    if (d.cling != null) {   // 器の外側を伝う: 縁（rim の外）から、底の横（bottom の外、少し下）へ
      d.cling += dt
      const u = Math.min(1, d.cling / CLING), c = P.pose
      const [x, y] = toWorld(c, d.side * (BOWL.rim + 1.5 + (BOWL.bottom - BOWL.rim + 1.5) * u), -BOWL.depth + (BOWL.depth + 2.5) * u)
      d.x = x; d.y = y
      if (u >= 1 || P.free) { const bv = P.vel || { x: 0, y: 0 }; d.cling = null; d.vx = bv.x * DROP_KEEP; d.vy = Math.max(0, bv.y) * DROP_KEEP + 15 }
      continue
    }
    d.vx *= Math.exp(-DROP_AIR * dt)
    d.vy += DROP_G * dt
    if (world && isSolidKind(tileAt(world, Math.floor((d.x + d.vx * dt) / TILE), Math.floor(d.y / TILE)))) d.vx = 0   // 壁で止まる
    d.x += d.vx * dt; d.y += d.vy * dt
    if (world && isSolidKind(tileAt(world, Math.floor(d.x / TILE), Math.floor((d.y + R) / TILE)))) { d.y = Math.floor((d.y + R) / TILE) * TILE - R; d.landed = true; d.vx = 0; d.life = Math.min(d.life, 0.2) }   // 床でとどまる（着いてから 0.8 秒そのまま、そのあとまたたいて消える。全部こぼしたときと同じ）
  }
  P.drops = P.drops.filter((d) => d.life < 1.6)
}
// 粒が器の外か（縁より上なら縁の幅の外、縁より下なら壁の外）
const outside = (p) => {
  if (p.y < -BOWL.depth) return Math.abs(p.x) > BOWL.rim + 0.5
  if (p.y > 1) return true
  return Math.abs(p.x) > BOWL.bottom + (BOWL.rim - BOWL.bottom) * (-p.y / BOWL.depth) + 0.5
}

// こぼす: 見えない壁を外し、傾いた側（dir: -1 左・1 右）へ、塊で押し出す
export function spillPorridge(P, dir) {
  P.free = true
  const c = P.pose, co = Math.cos(c.a), si = Math.sin(c.a), bv = P.vel || { x: 0, y: 0 }
  for (const p of P.ps) {
    const [x, y] = toWorld(c, p.x, p.y), vx = p.vx * co - p.vy * si + bv.x * 0.6, vy = p.vx * si + p.vy * co + bv.y * 0.6
    p.x = p.px = x; p.y = p.py = y; p.vx = vx; p.vy = vy
  }
  for (const p of P.ps) { p.vx += dir * (70 + Math.random() * 30); p.vy -= 50 + Math.random() * 30 }
}
