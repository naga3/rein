// タイトル画面の、道ごとの主人公たち（2026-11-07）: 画面のいちばん下（花畑の中）を歩く。たどり着いた道（記録のある道）の者だけが出る（地獄の者はいつも）
//   地獄の者: 走り回り、ときどき転ぶ（いつも何かから逃げている）
//   カエル: 跳ねながら、前を飛ぶ虫を追いかける（小さな者を追う）
//   人: ゆっくり歩き、ときどき立ち止まる
//   餓鬼: 人の後ろをついて回る（人がいなければ、うろうろ）
//   出来事（12〜20 秒に一度）: 人が立ち止まって餓鬼のほうを向き、食べ物を手渡す。受け取った瞬間に花びらが舞い（随喜）、
//     餓鬼はしばらく、すぐ後ろを跳ねながら嬉しそうについて歩く
//   絵は道ごとのプレイヤーの絵（右向き。左へ行くときは裏返す）。乱数は種から（hash）
import { P } from './palette.js'
import { ART } from './art.js'

const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }
const ART_OF = { hell: 'player/player', animal: 'animal/frog', peta: 'peta/peta', human: 'human/human' }
export const WALKERS = Object.keys(ART_OF)

export function createWalkers(px, W) {
  const GROUND = 234   // 足もとの高さ（花畑の中）
  const actors = new Map()
  let lastT = null, petals = [], gift = null, nextGift = 9, n = 0
  const rnd = () => hash(n++, 17, 5)

  const blit = (ref, name, x, y, flip) => {
    const a = ART[ref], rows = a?.pics?.[name] ?? a?.pics?.stand
    if (!rows) return
    const w = rows[0].length
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') px(Math.round(x + (flip ? w - 1 - i : i)), Math.round(y + j), a.colors[ch]) }))
  }
  const ensure = (reached) => {
    for (const r of reached) if (ART_OF[r] && !actors.has(r)) actors.set(r, { r, x: 30 + rnd() * (W - 60), dir: rnd() < 0.5 ? -1 : 1, st: 'walk', t: 0, y: 0, vy: 0, happy: 0, next: 3 + rnd() * 5 })
    for (const r of [...actors.keys()]) if (!reached.includes(r)) actors.delete(r)
  }
  // 画面の端で向きを変える
  const bounce = (a) => { if (a.x < 12) { a.x = 12; a.dir = 1 } else if (a.x > W - 12) { a.x = W - 12; a.dir = -1 } }

  const step = (t, reached) => {
    const dt = lastT == null ? 0 : Math.min(0.05, Math.max(0, t - lastT))
    lastT = t
    ensure(reached)
    const hum = actors.get('human'), pet = actors.get('peta')
    // 出来事: 人が餓鬼に食べ物を手渡す
    nextGift -= dt
    if (!gift && hum && pet && nextGift <= 0 && Math.abs(hum.x - pet.x) < 70 && hum.st !== 'give') {
      gift = { t: 0 }; hum.st = 'give'; pet.st = 'take'
      hum.dir = Math.sign(pet.x - hum.x) || 1; pet.dir = -hum.dir
    }
    if (gift) {
      gift.t += dt
      if (gift.t > 0.9 && !gift.done) {
        gift.done = true; pet.happy = 8
        for (let i = 0; i < 18; i++) petals.push({ x: pet.x, y: GROUND - 10, vx: (rnd() - 0.5) * 50, vy: -30 - rnd() * 40, t: 0, life: 1.2 + rnd() * 0.8, c: [P.rd3, P.pk2, P.pk3, P.white][i % 4] })
      }
      if (gift.t > 1.6) { gift = null; hum.st = 'walk'; pet.st = 'walk'; nextGift = 12 + rnd() * 8 }
    }
    for (const a of actors.values()) {
      a.t += dt
      if (a.st === 'give' || a.st === 'take') continue
      if (a.r === 'hell') {
        // 走り回り、ときどき転ぶ
        a.next -= dt
        if (a.st === 'trip') { if (a.t > 0.6) { a.st = 'walk'; a.t = 0 } continue }
        if (a.next <= 0) { a.st = 'trip'; a.t = 0; a.next = 5 + rnd() * 5; continue }
        if (rnd() < dt * 0.3) a.dir = -a.dir
        a.x += a.dir * 34 * dt
      } else if (a.r === 'animal') {
        // 跳ねて進み、前の虫を追う（ときどき虫が後ろへ回り、向きを変える）
        a.next -= dt
        if (a.next <= 0) { a.dir = -a.dir; a.next = 3 + rnd() * 4 }
        if (a.y >= 0 && a.vy >= 0) { a.y = 0; a.vy = 0; if (a.t > 0.35) { a.vy = -70; a.t = 0 } }
        if (a.vy !== 0 || a.y < 0) { a.vy += 260 * dt; a.y += a.vy * dt; a.x += a.dir * 42 * dt; if (a.y > 0) { a.y = 0; a.vy = 0 } }
      } else if (a.r === 'human') {
        // ゆっくり歩き、ときどき立ち止まる
        a.next -= dt
        if (a.st === 'rest') { if (a.t > 2) { a.st = 'walk'; a.t = 0; if (rnd() < 0.4) a.dir = -a.dir } continue }
        if (a.next <= 0) { a.st = 'rest'; a.t = 0; a.next = 4 + rnd() * 5; continue }
        a.x += a.dir * 16 * dt
      } else if (a.r === 'peta') {
        // 人の後ろをついて回る（施しを受けたあとは、すぐ後ろを跳ねながら）
        a.happy = Math.max(0, a.happy - dt)
        let to
        if (hum) to = hum.x - hum.dir * (a.happy ? 14 : 30)
        else { a.next -= dt; if (a.next <= 0) { a.dir = -a.dir; a.next = 3 + rnd() * 4 } to = a.x + a.dir * 20 }
        const d = to - a.x
        if (Math.abs(d) > 2) { a.dir = Math.sign(d); a.x += a.dir * Math.min(Math.abs(d) * 2, a.happy ? 30 : 22) * dt; a.moving = true } else { a.moving = false; if (hum) a.dir = hum.dir }
        // 嬉しいときは小さく跳ねる
        if (a.happy && a.y >= 0 && a.vy >= 0 && a.t > 0.4) { a.vy = -45; a.t = 0 }
        if (a.vy !== 0 || a.y < 0) { a.vy += 260 * dt; a.y += a.vy * dt; if (a.y > 0) { a.y = 0; a.vy = 0 } }
      }
      bounce(a)
    }
    petals = petals.filter((p) => (p.t += dt) < p.life)
    for (const p of petals) { p.vx *= Math.exp(-2 * dt); p.vy = Math.min(16, p.vy + 90 * dt); p.x += (p.vx + Math.sin(p.t * 7 + p.c) * 10) * dt; p.y += p.vy * dt }
  }

  const draw = (t) => {
    for (const a of [...actors.values()].sort((p, q) => p.x - q.x)) {
      const ref = ART_OF[a.r], two = ART[ref]?.pics?.run2
      const frame = Math.floor(t * (a.r === 'hell' ? 10 : 6)) % 2
      let name = two ? (frame ? 'run1' : 'run2') : frame ? 'run1' : 'stand'
      if (a.st === 'rest' || a.st === 'give' || a.st === 'take' || (a.r === 'peta' && !a.moving && !a.happy)) name = 'stand'
      if (a.r === 'hell' && a.st === 'trip') name = 'climb'
      if ((a.r === 'animal' || a.r === 'peta') && a.y < -1) name = 'jump'
      blit(ref, name, a.x - 8, GROUND - 16 + (a.y || 0), a.dir < 0)
      // 虫（カエルの前を飛ぶ。1 ドット、羽ばたいて明滅）
      if (a.r === 'animal') { const bx = Math.round(a.x + a.dir * (24 + Math.sin(t * 3) * 6)), by = Math.round(GROUND - 16 + Math.sin(t * 7) * 4); px(bx, by, Math.floor(t * 12) % 2 ? P.ye3 : P.gy4) }
    }
    // 手渡す食べ物（人の手から餓鬼の手へ）
    if (gift) {
      const hum = actors.get('human'), pet = actors.get('peta'), k = Math.max(0, Math.min(1, (gift.t - 0.3) / 0.6))
      if (hum && pet && gift.t < 1.3) {
        const x = hum.x + (pet.x - hum.x) * k, y = GROUND - 9 - Math.sin(k * Math.PI) * 4
        blit('peta/food', 'offering', x - 8, y - 8, false)
      }
    }
    for (const p of petals) px(Math.round(p.x), Math.round(p.y), p.c)
  }
  return { step, draw }
}
