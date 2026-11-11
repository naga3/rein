// 餓鬼の道の布施人の体の動き（2026-11-07。ゲーム src/game.js の stepDonors と、自動のテストプレイ tools/solve.mjs で同じものを使う）
//   決まりの値は world.js の DONOR。気づく・見失う・光の部屋で供える、の流れはゲームの側
import { TILE, K, tileAt, isSolidKind, DONOR } from './world.js'

export const donorSolid = (world, x, y) => { const k = tileAt(world, Math.floor(x / TILE), Math.floor(y / TILE)); return isSolidKind(k) || k === K.hidden }
// 川は本物の血の川（~）だけ。すり抜ける川（L）は、布施人にとっても空いた所（餓鬼が下にいれば、落ちて抜ける。2026-11-07）
const donorRiver = (world, x, y) => { const k = tileAt(world, Math.floor(x / TILE), Math.floor(y / TILE)); return k === K.fire }
// x の列を y から下へたどって、先に川があるか（落ちる先が川なら true）
export const riverBelow = (world, x, y) => { for (let yy = y; yy < y + 16 * TILE; yy += TILE) { if (donorRiver(world, x, yy)) return true; if (donorSolid(world, x, yy)) return false } return false }

// 一コマ動かす。b: { x, y（足もと）, vx, vy, dir, onGround }、want: 歩きたい向き×速さ（0 なら止まる）、
//   below: 餓鬼が下にいる（床の端で、落ちて降りてよい）、follow: ついて来ている（1 マスの穴を跳び越えてよい）。
//   歩く頭: 先の足もとを見て、段・穴・川を判断する（地面にいるときだけ）。
//   前が壁 → 1 マスの段なら跳んで上る、そうでなければ止まる。前が床の端 → 落ちる先が川なら止まる、below なら落ちる、
//   follow で 1 マスの穴なら跳び越える、そうでなければ止まる。高い所から落ちても死なない
//   戻り値: 止められた（壁・端・川で、歩きたいのに歩けなかった）なら true
export function moveDonor(b, world, want, below, follow, dt) {
  let blocked = false, jumped = false
  if (want && b.onGround) {
    const dir = Math.sign(want), ax = b.x + dir * 6
    b.dir = dir
    if (donorSolid(world, ax, b.y - 2)) {
      if (!donorSolid(world, ax, b.y - 2 - TILE) && !donorSolid(world, b.x, b.y - 2 - TILE)) { b.vy = -DONOR.stepV; b.onGround = false; jumped = true } else { want = 0; blocked = true }
    } else if (!donorSolid(world, ax, b.y + 2)) {
      const far = b.x + dir * (6 + TILE)
      if (riverBelow(world, ax, b.y + 2)) { want = 0; blocked = true }
      else if (below) { /* そのまま落ちる */ }
      else if (follow && donorSolid(world, far, b.y + 2) && !donorSolid(world, far, b.y - 2) && !riverBelow(world, far, b.y + 2)) { b.vy = -DONOR.gapV; b.onGround = false; jumped = true; want = dir * DONOR.gapVx }
      else { want = 0; blocked = true }
    }
  }
  // 空中では横の速さを保つ（airVx。跳んだ・落ちたときの勢い。段の壁に一瞬当たっても消さない。次のコマで歩く速さにも戻さない。2026-11-07）
  if (b.onGround || jumped) { b.vx = want; b.airVx = jumped ? want : null }
  else { if (b.airVx == null) b.airVx = b.vx; b.vx = b.airVx }
  // 動く（横 → 縦。壁と床で止まる）
  const nx = b.x + b.vx * dt
  if (!donorSolid(world, nx + Math.sign(b.vx) * 4, b.y - 2) && !donorSolid(world, nx + Math.sign(b.vx) * 4, b.y - 12)) b.x = nx; else b.vx = 0
  b.vy = Math.min(DONOR.maxFall, b.vy + DONOR.gravity * dt)
  const ny = b.y + b.vy * dt
  if (b.vy >= 0 && (donorSolid(world, b.x - 3, ny) || donorSolid(world, b.x + 3, ny))) { b.y = Math.floor(ny / TILE) * TILE; b.vy = 0; b.onGround = true; b.airVx = null }
  else if (b.vy < 0 && donorSolid(world, b.x, ny - 14)) { b.vy = 0; b.onGround = false }
  else { b.y = ny; b.onGround = false }
  return blocked
}

// 餓鬼との離れ（dx, dy = 餓鬼 − 布施人。足もとどうし）が、どの段か: 'near'（そば。止まって待つ）・'follow'・'uneasy'（不安。止まって見回す）・'lose'（見失う）
//   横は厳しく、縦はゆるく（下へ落として連れて行けるように）
export function donorZone(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy)
  if (ax > DONOR.loseX || ay > DONOR.loseY) return 'lose'
  if (ax > DONOR.uneasyX || ay > DONOR.uneasyY) return 'uneasy'
  if (ax <= DONOR.near && ay <= 24) return 'near'
  return 'follow'
}

// 足もと（x, y）の床の、うろうろできる左右の端（ドット。体の真ん中）。見失ったあと、その場の床でうろうろするのに使う（2026-11-07）。
//   空いていて、下が床（岩）で、川でないマスが続く間
export function floorSpanAt(world, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor((y - 1) / TILE)
  const ok = (cx) => !donorSolid(world, cx * TILE + 8, ty * TILE + 8) && donorSolid(world, cx * TILE + 8, (ty + 1) * TILE + 8) && !riverBelow(world, cx * TILE + 8, (ty + 1) * TILE)
  let x0 = tx, x1 = tx
  while (x0 > tx - 40 && ok(x0 - 1)) x0--
  while (x1 < tx + 40 && ok(x1 + 1)) x1++
  return [x0 * TILE + 7, (x1 + 1) * TILE - 7]
}
