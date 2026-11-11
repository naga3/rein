// プレイヤーの動き（描画なし）。x, y は足もとの真ん中。当たりは幅 10・高さ 14
// input: { x（-1〜1）, y（-1〜1）, dash（ダッシュのボタンを押している）, dashPressed（押した瞬間） }
// 動き（2026-11-04〜05 に決めた）: 歩くとダッシュだけ。ジャンプは無い
//   ダッシュは 8 方向（方向キー・スティックの向き。向き無しなら真上）。押している間続き、離すと止まる（dashMin〜dashTime 秒）。
//   押している間に向きを変えると曲がる。地面に着くまでに dashes 回まで（地面からでも、崖から落ちてからでも同じ）。壁の角につかまると戻る
import { TILE, K, tileAt, isSolidKind } from './world.js'
import { REALMS } from './realms.js'

export const HW = 5, HH = 14
export const CLIMB_HAND = 6   // よじ登りの絵（art/player/player.pic の climb）で、手が足より何ドット上にあるか

export function createPlayer(x, y) {
  return {
    x, y, vx: 0, vy: 0, dir: 1, onGround: false,
    dash: 0, dashVx: 0, dashVy: 0, dashLeft: 0, dashBuf: 0, dashFx: 2, hang: 0, puffs: [], wisps: [], wispGo: 8, fxSeed: 0, trail: [], anim: 0, landT: 0, climb: null, grip: 0, drops: [], regrab: 0,
  }
}

const solidAt = (room, px, py) => isSolidKind(tileAt(room, Math.floor(px / TILE), Math.floor(py / TILE)))

export function stepPlayer(p, room, inp, T, dt) {
  // よじ登り: 壁へさっと寄せ（settle）、角につかまって一瞬止まり（hold）、壁の方へ押している間、止まったまま力をため（effort）、
  // たまりきったら一気に体を引き上げる（pull）。押していなければ、ぶら下がったまま汗をかき、しばらくすると手が離れて落ちる
  if (p.climb) {
    const c = p.climb
    c.t += dt
    const push = Math.sign(inp.x) === p.dir
    if (c.t < c.settle) {
      const e = c.t / c.settle
      p.x = c.fromX + (c.hangX - c.fromX) * e
      p.y = c.fromY + (c.hangY - c.fromY) * e
    } else {
      // 反対へ押すか、下を押したら、手を離す
      if (c.k === 0 && ((inp.x && !push) || inp.y > 0)) { letGo(p, T); tick(p, dt); return }
      // 押している間は、止まったまま力をためる（effort）。たまりきったら、引き上げは一気に（押していなくても最後まで）
      if (c.k === 0 && c.t >= c.settle + c.hold && push) c.effort += dt
      if (c.k > 0 || c.effort >= T.climbEffort) c.k = Math.min(1, c.k + dt / c.dur)
      if (!push && c.k === 0) c.hang += dt
      const up = Math.min(1, c.k / 0.7), fwd = Math.max(0, (c.k - 0.5) / 0.5)
      p.y = c.hangY + (c.toY - c.hangY) * (up * up * (3 - 2 * up))
      p.x = c.hangX + (c.toX - c.hangX) * fwd
      // 汗: ぶら下がっている間、ずっと。漫画の汗のように、頭のてっぺんから両側へ一粒ずつ飛んで、すぐ消える。長くなるほど間が詰まる
      c.sweatT -= dt
      if (c.sweatT <= 0) {
        const tired = Math.min(1, c.hang / T.hangMax)
        c.sweatT = 0.22 - tired * 0.08
        for (const side of [-1, 1]) {
          // 向きは、真上から外へ 30〜65 度倒した向き。速さも寿命もばらばら
          const s = ++p.fxSeed, a = -Math.PI / 2 + side * (0.5 + rnd(s, 1) * 0.6), sp = 22 + rnd(s, 2) * 22
          p.drops.push({ x: p.x + side * (1 + rnd(s, 3) * 3), y: p.y - 18 + rnd(s, 4) * 5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.18 + rnd(s, 5) * 0.15 })
        }
      }
      if (c.k >= 1) { p.climb = null; p.onGround = true; p.vy = 0; p.vx = p.dir * T.runMax * 0.4; p.landT = 0.08 }
      else if (c.hang >= T.hangMax) letGo(p, T)
    }
    tick(p, dt)
    return
  }
  if (p.regrab > 0) p.regrab -= dt
  // 地面にいる間に回数を戻す。ただしダッシュ中は戻さない（地面から上へ出た直後のコマは、まだ地面にいる扱いなので、ここで戻すと 1 回多くなっていた）
  if (p.onGround && p.dash <= 0) p.dashLeft = T.dashes

  // 先押し: ダッシュを使い切った空中で押したら、少しの間（dashBuffer 秒）覚えておき、着地して回数が戻った瞬間に出す（2026-11-05）
  if (inp.dashPressed && p.dashLeft <= 0) p.dashBuf = T.dashBuffer
  else if (p.dashBuf > 0) p.dashBuf -= dt
  const wantDash = inp.dashPressed || (p.dashBuf > 0 && p.dashLeft > 0)
  // ダッシュを始める（8 方向。向き無しなら真上）
  if (wantDash && p.dash <= 0 && p.dashLeft > 0) {
    p.dashBuf = 0
    let dx = Math.sign(inp.x), dy = Math.sign(inp.y)
    if (!dx && !dy) dy = -1
    // 地面から横だけを入れたときは、斜め上へ（2026-11-05。地面の真横ダッシュはたいてい誤爆で、前へ跳びたいとき。スマホの斜めの取りこぼしも拾う）。
    //   同じ横を押し続けている間は斜め上のまま（dashLift）。入れる向きを変えたら、そこからはいつも通り曲がる。空中の横は真横のまま
    p.dashLift = p.onGround && dx && !dy ? dx : 0
    if (p.dashLift) dy = -1
    const n = Math.hypot(dx, dy)
    p.dashVx = dx / n * T.dashSpeed
    p.dashVy = dy / n * T.dashSpeed
    p.dash = T.dashTime
    p.dashLeft--
    // 一段目は残像も白い体も出さない。二段目だけ光る（2026-11-05。メリハリを出す）
    p.dashFx = T.dashes - p.dashLeft === 1 ? 0 : 2
    p.sfx = 'dash1'   // 効果音（main.js が鳴らして消す）: 一段目も二段目も同じ音（2026-11-07）
    // 地面からダッシュしたときだけ、足もとで地面を蹴る効果（崖から落ちている間に始めたときは出さない）
    if (p.onGround) p.puffs.push(groundKick(p.x, p.y, dx, dy, ++p.fxSeed, room.realm ?? 'hell'))
    if (dx) p.dir = dx
    return
  }

  if (p.dash > 0) {
    // ダッシュの間は、押している向きに曲がる（速さはそのまま。何度でも）。離すと止まる（dashMin 秒より短くはならない。dashTime 秒で終わり）
    if (p.dashLift && (Math.sign(inp.x) !== p.dashLift || inp.y)) p.dashLift = 0   // 向きを変えたら、斜め上の扱いをやめる
    if ((inp.x || inp.y) && !p.dashLift) {
      const dx = Math.sign(inp.x), dy = Math.sign(inp.y), n = Math.hypot(dx, dy)
      p.dashVx = dx / n * T.dashSpeed; p.dashVy = dy / n * T.dashSpeed
      if (dx) p.dir = dx
    }
    p.dash -= dt
    if (!inp.dash && T.dashTime - p.dash >= T.dashMin) p.dash = 0   // 離したら止まる
    p.vx = p.dashVx; p.vy = p.dashVy
    if (p.dashFx) p.trail.push({ x: p.x, y: p.y, t: 0, dir: p.dir })
    if (p.dash <= 0) { p.vx *= T.dashEnd; p.vy = p.vy < 0 ? p.vy * T.dashEnd : p.vy * 0.5; if (p.dashVy < 0) p.hang = T.dashHang }   // 上へのダッシュが止まったら、頂点で少しふわっと（足場へ乗る狙いをつけやすく）
  } else {
    // 走る
    // 縁の近くに着地した直後は、走る速さを抑える（押したまま着地して、離すのが少し遅れても落ちない）
    if (p.grip > 0) p.grip -= dt
    const want = inp.x * T.runMax * (p.grip > 0 && p.onGround ? T.gripSpeed : 1)
    let accel = p.onGround ? (inp.x ? T.groundAccel : T.groundDecel) : (inp.x ? T.airAccel : T.airDecel)
    // 空中で逆に入れたら、強く切り返す（跳びすぎを戻しやすく）
    if (!p.onGround && inp.x && Math.sign(inp.x) !== Math.sign(p.vx) && Math.abs(p.vx) > 1) accel *= T.airTurn
    // 速さを超えているとき（ダッシュの名残）は、空中ではゆっくり戻す
    const a = Math.abs(p.vx) > T.runMax && Math.sign(p.vx) === Math.sign(inp.x) && !p.onGround ? T.airDecel : accel
    if (p.vx < want) p.vx = Math.min(want, p.vx + a * dt)
    else if (p.vx > want) p.vx = Math.max(want, p.vx - a * dt)
    if (inp.x) p.dir = Math.sign(inp.x)
    // 重さ（落ちるときは重く、頂点では軽く）
    let g = T.gravity
    if (p.vy > 0) g *= T.fallMul
    if (inp.dash && Math.abs(p.vy) < T.apexBand) g *= T.apexHang   // ボタンを押したまま頂点に来たら、ふわっと
    if (p.hang > 0) { p.hang -= dt; g *= T.apexHang }   // 上へのダッシュが止まったあとの、ふわっと
    p.vy = Math.min(T.maxFall, p.vy + g * dt)
  }

  // 動かして、当たりを解く（横、縦の順）
  const wasGround = p.onGround
  moveX(p, room, p.vx * dt, T)
  p.onGround = false
  moveY(p, room, p.vy * dt, T)
  if (p.onGround && !wasGround) {
    p.landT = 0.1
    // 着地でぴたっと止まる: 方向キーを入れていないか、逆に入れていれば、横の勢いを消す
    if (!inp.x || Math.sign(inp.x) !== Math.sign(p.vx)) p.vx *= T.landKeep
    // ダッシュの勢いは、着地したら走る速さまで落とす（細い足場から滑り出ない）
    if (Math.abs(p.vx) > T.runMax) p.vx = Math.sign(p.vx) * T.runMax
    // 進む向きの 1 タイル先に足場が無ければ（縁が近い）、少しの間ふんばる
    const dir = Math.sign(p.vx) || Math.sign(inp.x)
    if (dir && !isSolid(room, p.x + dir * (HW + 12), p.y + 2)) { p.grip = T.gripTime; p.vx = Math.sign(p.vx) * Math.min(Math.abs(p.vx), T.runMax * T.gripSpeed) }
  }
  // よじ登り: 空中で壁へ押していて、壁の上の角が足のすぐ上にあるとき
  if (!p.onGround && !p.climb) tryMantle(p, room, inp, T)
  if (Math.abs(p.vx) > 5 && p.onGround) p.anim += dt
  // 歩くと、足もとから鬼火が生まれる（歩いた距離でぽつぽつ。地獄だけ）
  if (REALMS[room.realm ?? 'hell']?.wisps !== false && p.onGround && !p.climb && Math.abs(p.vx) > 40) {
    p.wispGo -= Math.abs(p.vx) * dt
    if (p.wispGo <= 0) { const s = ++p.fxSeed; p.wisps.push(wisp(p.x - Math.sign(p.vx) * 3, p.y - 1, Math.sign(p.vx), s)); p.wispGo = 10 + rnd(s, 7) * 14 }
  }
  tick(p, dt)
}

// 乱数は seed から（毎回同じ形）
export const rnd = (seed, i) => { let h = (seed * 374761393 + i * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }

// 地面を蹴る効果（描くのは render.js）: 蹴った瞬間に足もとが白く光り（2 コマ）、土ぼこりが進む向きと逆へ噴き出して膨らみながら薄れ、
//   小さな粒が後ろへ飛んで一度跳ねる。真上へのダッシュでは、左右両方へ。大きさ・速さ・寿命は一つずつばらばら（種から）
function groundKick(x, y, dx, dy, seed, realm) {
  const sides = dx ? [-Math.sign(dx)] : [-1, 1]
  const dust = [], grit = []
  sides.forEach((side, si) => {
    for (let i = 0; i < (dx ? 4 : 2); i++) {
      const s = si * 10 + i, sp = 30 + rnd(seed, s) * 50
      dust.push({ x: x + side * (2 + rnd(seed, s + 20) * 3), y: y - 1 - rnd(seed, s + 40) * 2, vx: side * sp, vy: -(6 + rnd(seed, s + 60) * 14) * (dy < 0 ? 1.4 : 1), drag: 6 + rnd(seed, s + 80) * 4, r0: 0.6 + rnd(seed, s + 100) * 0.7, life: 0.22 + rnd(seed, s + 120) * 0.2, delay: rnd(seed, s + 140) * 0.04 })
    }
    for (let i = 0; i < (dx ? 3 : 2); i++) {
      const s = si * 10 + i + 200
      grit.push({ x: x + side * 3, y: y - 1, vx: side * (40 + rnd(seed, s) * 50), vy: -(30 + rnd(seed, s + 30) * 50), life: 0.3 + rnd(seed, s + 60) * 0.2 })
    }
  })
  return { x, y, t: 0, seed, realm, dir: dx ? Math.sign(dx) : 0, sides, dust, grit }
}

// 歩いたあとの鬼火（描くのは render.js）: 後ろへ漂いながら昇り、小さくなって、またたいて消える
function wisp(x, y, dir, seed) {
  return { x, y, vx: -dir * (14 + rnd(seed, 1) * 22), vy: -(6 + rnd(seed, 2) * 8), lift: 60 + rnd(seed, 6) * 50, t: 0, life: 0.45 + rnd(seed, 3) * 0.4, big: rnd(seed, 4) < 0.7, phase: rnd(seed, 5) * 6.28, seed }
}

function tick(p, dt) {
  p.landT = Math.max(0, p.landT - dt)
  // 地面を蹴った効果: 土ぼこりは強い抵抗で後ろへ流れて膨らみ、粒は落ちて一度跳ねる
  for (const k of p.puffs) {
    k.t += dt
    for (const d of k.dust) { const e = Math.exp(-d.drag * dt); d.vx *= e; d.vy *= e; d.x += d.vx * dt; d.y += d.vy * dt }
    for (const g of k.grit) { if (g.rest) continue; g.vy += 420 * dt; g.x += g.vx * dt; g.y += g.vy * dt; if (g.y > k.y) { if (g.bounce) { g.y = k.y; g.rest = true } else { g.y = k.y; g.vy *= -0.4; g.vx *= 0.6; g.bounce = true } } }
  }
  p.puffs = p.puffs.filter((k) => k.t < 0.5)
  for (const w of p.wisps) { w.t += dt; w.vx *= Math.exp(-2.5 * dt); w.vy -= w.lift * dt; w.x += w.vx * dt; w.y += w.vy * dt }   // 浮かぶ力で、だんだん速く昇る
  p.wisps = p.wisps.filter((w) => w.t < w.life)
  for (const d of p.drops) { d.t += dt; d.vy += 210 * dt; d.x += d.vx * dt; d.y += d.vy * dt }
  p.drops = p.drops.filter((d) => d.t < d.life)
  for (const tr of p.trail) tr.t += dt
  p.trail = p.trail.filter((tr) => tr.t < 0.22)
}

const isSolid = (room, x, y) => isSolidKind(tileAt(room, Math.floor(x / TILE), Math.floor(y / TILE)))
// 体がすり抜けの炎（K.fakeFire）にかかっている（足から頭のどこか）: このときは縁につかまらず、段も上らない（1 マスの穴でも、そのまま下へ抜ける）
const inFakeFire = (room, p) => {
  const tx = Math.floor(p.x / TILE)
  for (let ty = Math.floor((p.y - HH) / TILE); ty <= Math.floor((p.y - 1) / TILE); ty++) if (tileAt(room, tx, ty) === K.fakeFire) return true
  return false
}

// 角から手を離して落ちる（すぐにまた掴まないよう、少しの間は掴めない）
function letGo(p, T) {
  // 壁にめり込んだまま落とすと、角の上に着地したことになるので、まず壁の外へ出す
  p.x = p.climb.wallX - p.dir * (HW + 0.01)
  p.climb = null
  p.vy = 30; p.vx = -p.dir * 25
  p.regrab = 0.35
  p.onGround = false
}

// 崖の角につかまる（2026-11-05 に甘くした）:
//   向き: 横向きのダッシュ中はその向き、方向キーを入れていればその向き、無ければ体の向き（落ちているだけでも、向いている方の崖をつかむ。救済）
//   いつ: 勢いよく上っている間（上向きの速さが 60 より速い）はつかまない（上へのダッシュの途中の角に引っかからない。横・斜めのダッシュ中は別）。
//     下を押している間はつかまない（下りたいとき）
//   どこ: 足が角の上の面より mantleReach ドット下まで（足のある段だけでなく、頭の高さまでの段を探す）、壁が体の横 grabGap ドット先まで。
//     体からつかむ所までの間が空いていること。つかむ位置へは settle の間に寄せる
function tryMantle(p, room, inp, T) {
  if (inFakeFire(room, p)) return
  if (p.noGrab) return   // 人の道で乳粥を運ぶ間は、両手がふさがっているので角につかまれない（2026-11-08）
  if (T.mantleReach <= 0 || p.regrab > 0 || inp.y > 0) return
  const dashingSide = p.dash > 0 && p.dashVx !== 0
  const dir = dashingSide ? Math.sign(p.dashVx) : Math.sign(inp.x) || p.dir
  if (!dir) return
  if (!dashingSide && p.vy < -60) return
  // 壁を探す: 体の横 1〜grabGap+1 ドット先。足から mantleReach 上までの段で、角（下が岩で、上が空き）がある所
  let fx = 0, ledgeTop = 0, found = false
  for (let gap = 1; gap <= 1 + (T.grabGap ?? 0) && !found; gap++) {
    const x = p.x + dir * (HW + gap)
    if (gap > 1 && isSolid(room, x - dir, p.y - HH + 2)) break   // 間に岩がある（体の頭の高さで見る）
    for (let ty = Math.floor((p.y - 1) / TILE); ty * TILE >= p.y - T.mantleReach - 1; ty--) {
      const top = ty * TILE, depth = p.y - top
      if (depth <= 0 || depth > T.mantleReach) continue
      if (isSolid(room, x, top + 1) && !isSolid(room, x, top - 1)) { fx = x; ledgeTop = top; found = true; break }
    }
  }
  if (!found) return
  const tx = Math.floor(fx / TILE)
  // 角の上と、登る途中に、体が入る空きがあるか
  for (let y = ledgeTop - HH; y < ledgeTop; y += 4) if (isSolid(room, fx, y)) return
  const wallX = dir > 0 ? tx * TILE : (tx + 1) * TILE
  const hx = wallX - dir * (HW - 2)
  // 今の体の所から、つかむ位置（壁ぎわ、角の高さ）まで寄せる間が空いているか: 体の幅の範囲を、角の上から今の足もとまで
  const x0 = Math.min(p.x, hx) - HW + 1, x1 = Math.max(p.x, hx) + HW - 1
  for (let y = ledgeTop - HH; y < p.y; y += 4) for (let x = x0; x <= x1; x += 4) if ((dir > 0 ? x < wallX : x >= wallX) && isSolid(room, x, y)) return
  const toX = dir > 0 ? tx * TILE + HW + 1 : (tx + 1) * TILE - HW - 1
  // つかむ位置: 手がちょうど角の上の面に乗る高さ（climb の絵の手は足の 6〜7 ドット上なので、足は角の上の面より 6 ドット下）。
  // 横は、壁に 2 ドットめり込んで張り付く（wallX は上で求めた）
  const hangX = wallX - dir * (HW - 2), hangY = ledgeTop + CLIMB_HAND
  p.dashLeft = T.dashes   // 角につかまると、ダッシュが戻る
  p.climb = { t: 0, k: 0, effort: 0, hang: 0, sweatT: 0.04, settle: 0.04, wallX, hold: T.climbHold, dur: T.climbTime, fromX: p.x, fromY: p.y, hangX, hangY, toX, toY: ledgeTop }
  p.dir = dir
  p.vx = 0; p.vy = 0; p.dash = 0
}

// デバッグの「飛ぶ」（src/debug.js）: 重さを無視して、方向キーの向きへ speed で動く。壁・床には当たる
export function flyPlayer(p, room, inp, T, speed, dt) {
  p.climb = null; p.dash = 0; p.hang = 0; p.grip = 0
  const d = Math.hypot(inp.x, inp.y) || 1
  p.vx = (inp.x / d) * speed; p.vy = (inp.y / d) * speed
  if (inp.x) p.dir = Math.sign(inp.x)
  moveX(p, room, p.vx * dt, T)
  p.onGround = false
  moveY(p, room, p.vy * dt, T)
  p.dashLeft = T.dashes   // 離したら、すぐダッシュできるように
}

function moveX(p, room, dx, T) {
  const steps = Math.ceil(Math.abs(dx) / 4) || 1
  for (let i = 0; i < steps; i++) {
    const nx = p.x + dx / steps
    const edge = nx + (dx > 0 ? HW : -HW)
    if (hitsV(room, edge, p.y - HH + 1, p.y - 1)) {
      // 小さな段: 足もとより少しだけ高い角なら、そのまま乗り上げる（上っている途中は除く）
      const top = Math.floor((p.y - 1) / TILE) * TILE
      if (T && T.stepUp > 0 && p.vy >= -1 && !inFakeFire(room, p) && p.y - top <= T.stepUp && !hitsV(room, edge, top - HH + 1, top - 1) && !hitsH(room, p.x - HW + 1, p.x + HW - 1, top - HH, false, p.y)) {
        p.y = top; p.x = nx; p.vy = Math.min(p.vy, 0)
        continue
      }
      p.x = dx > 0 ? Math.floor(edge / TILE) * TILE - HW - 0.001 : (Math.floor(edge / TILE) + 1) * TILE + HW + 0.001
      p.vx = 0; if (p.dash > 0) p.dashVx = 0
      return
    }
    p.x = nx
  }
}

function moveY(p, room, dy, T) {
  const steps = Math.ceil(Math.abs(dy) / 4) || 1
  for (let i = 0; i < steps; i++) {
    const ny = p.y + dy / steps
    // 頭のかすり: 天井の角に少しだけかかったなら、横にずらして通す
    if (dy < 0 && T && T.cornerNudge > 0 && hitsH(room, p.x - HW + 1, p.x + HW - 1, ny - HH, false, p.y)) {
      let moved = false
      for (let k = 1; k <= T.cornerNudge && !moved; k++) for (const s of [1, -1]) {
        const x = p.x + s * k
        if (!hitsH(room, x - HW + 1, x + HW - 1, ny - HH, false, p.y) && !hitsV(room, x + s * HW, p.y - HH + 1, p.y - 1)) { p.x = x; moved = true; break }
      }
    }
    if (dy > 0) {
      if (hitsH(room, p.x - HW + 1, p.x + HW - 1, ny, true, p.y)) {
        p.y = Math.floor(ny / TILE) * TILE
        p.vy = 0; p.onGround = true
        if (p.dash > 0) p.dashVy = 0
        return
      }
    } else if (hitsH(room, p.x - HW + 1, p.x + HW - 1, ny - HH, false, p.y)) {
      p.y = (Math.floor((ny - HH) / TILE) + 1) * TILE + HH
      p.vy = 0
      if (p.dash > 0) p.dashVy = 0
      return
    }
    p.y = ny
  }
  // 足もとに地面があるか（止まっているとき）
  if (dy === 0 && hitsH(room, p.x - HW + 1, p.x + HW - 1, p.y + 0.5, true, p.y)) p.onGround = true
}

const hitsV = (room, x, y0, y1) => {
  for (let y = y0; y <= y1; y += 8) if (solidAt(room, x, y, false, 0)) return true
  return solidAt(room, x, y1, false, 0)
}
const hitsH = (room, x0, x1, y, down, footY) => {
  for (let x = x0; x <= x1; x += 8) if (solidAt(room, x, y, down, footY)) return true
  return solidAt(room, x1, y, down, footY)
}

// 体の四角（死ぬものとの当たり。足場の当たりより少し小さく、かすめても死なない側に）
// 下の部屋から上の部屋へ入ったとき: 勢いが足りなければ、足が穴の縁（穴の左右 3 マスの、部屋の下の 3 行にある床のいちばん高い所）より
// riseOver ドット高くなるまで上がるように押し上げる。初めて見る部屋でも、上がった所で左右を選んで降りられるように
export function enterAbove(p, world, room, T) {
  const tx = Math.floor(p.x / TILE), bottom = room.y + room.h - 1
  let edgeRow = bottom
  for (let c = tx - 3; c <= tx + 3; c++) for (let row = bottom - 2; row <= bottom; row++) {
    if (row < edgeRow && isSolidKind(tileAt(world, c, row)) && !isSolidKind(tileAt(world, c, row - 1))) edgeRow = row
  }
  const h = p.y - (edgeRow * TILE - T.riseOver)
  if (h <= 0) return
  const v = Math.sqrt(2 * T.gravity * h)
  if (-p.vy >= v) return
  p.vy = -v
  p.dash = 0
}

export const hurtBox = (p) => ({ l: p.x - HW + 1.5, r: p.x + HW - 1.5, t: p.y - HH + 3, b: p.y - 1 })

