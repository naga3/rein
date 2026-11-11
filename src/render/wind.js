// 餓鬼の道の熱い風（2026-11-07。動きは game.js の stepWinds、決まりの値は world.js の WIND）
//   段取り（ref/pixelfx-ideas.md）:
//   待つ（つむじ風: 半透明の塵の柱が漏斗の形にねじれて立ちのぼり、枯れ葉と塵の粒が回る。ときどき火の粉。餓鬼が近いほど速く回る）→ ため（渦が締まって橙に色づく）
//   → 放つ（白い決めのコマと、はじける輪）→ 追う（しなる炎の舌と、外の淡い陽炎の筋。たくさんの火の粉が跡に残り、床に光がついてくる）
//   → 燃え尽きる（追う形のまま、冷えながらばらけて減り、火の粉になって散る）／壁に当たる（炎が面に沿って平たく広がり、焦げ跡と火の粉が残る）。
//   光る丸い芯は作らない（火の玉に見えないように）。光は段に刻む
import { P } from '../palette.js'
import { WIND, TILE, tileAt, isSolidKind } from '../world.js'
import { hash } from './base.js'

export function makeWind({ px, tint, addLight }) {
  const FIRE = [P.white, P.ye2, P.ye2, P.or2, P.or2, P.rd2, P.rd1], COOL = [P.gy5, P.gy4, P.gy4, P.gy3]
  const step3 = (v) => Math.ceil(Math.max(0, Math.min(1, v)) * 3) / 3
  // 火の色: u（0 熱い〜1 冷えた）と、風の熱さ heat（冷めるほど後ろの色へずれ、冷めきると灰）
  const fire = (u, heat) => heat < 0.25 ? COOL[Math.min(3, Math.floor(u * 4))] : FIRE[Math.min(6, Math.floor(u * 7 + (1 - heat) * 3))]
  const glowAt = (x, y, R, a) => { for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { const k = 1 - Math.hypot(i, j) / R; if (k > 0) addLight(x + i, y + j, P.or2, a * step3(k)) } }
  // 足もとの地面の高さ（下へ 6 マスまで。無ければ null）
  const groundBelow = (world, x, y) => {
    const tx = Math.floor(x / TILE)
    for (let ty = Math.floor(y / TILE); ty < Math.floor(y / TILE) + 6; ty++) if (isSolidKind(tileAt(world, tx, ty))) return ty * TILE
    return null
  }
  // 跡を、頭から尾へ 1 ドットずつたどった点（nx, ny はその所の、進む向きに直角な向き）
  const along = (trail) => {
    const pts = []
    let carry = 0
    for (let i = 0; i < trail.length - 1; i++) {
      const a = trail[i], b = trail[i + 1], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy)
      if (L < 1e-6) continue
      let s = carry
      for (; s < L; s += 1) pts.push({ x: a.x + (dx * s) / L, y: a.y + (dy * s) / L, nx: -dy / L, ny: dx / L })
      carry = s - L
    }
    return pts
  }

  // 待つ・ため: つむじ風。near（0〜1）: 餓鬼の近さ。k: ための進み（0〜1。待つ間は 0）
  const drawWhirl = (b, world, camX, camY, t, near, k) => {
    // つむじ風（2026-11-07 に半透明で描き直した）: 塵の柱は、下が細く上へ広がる漏斗。高さごとに柱の芯が揺れ、回る帯の濃淡でねじれて見える。
    //   上と縁ほど薄い（煙・塵は柔らかい塊。ref/pixelfx-ideas.md）。濃さは 4 段に刻む。足もとに平たい塵だまり。枯れ葉と塵の粒（不透明）がまわりを回る。
    //   餓鬼が近いほど（near）速く回り、高く、濃くなる。ため（k）では、生まれる所へ締まって、橙に色づき、光る
    const ox = b.w.x - camX, oy = b.w.y - camY
    const g = groundBelow(world, b.w.x, b.w.y), base = (g ?? b.w.y + 8) - camY
    const sp = 5 + near * 6 + k * 18, Hh = (15 + near * 4) * (1 - k * 0.4),   // 高さは 1 マス少し（2026-11-07 に小さくした）
      dens = 0.95 + near * 0.25 + k * 0.3
    const lift = k * k   // ため: 柱ごと、生まれる所へ寄っていく
    for (let h = 0; h < Hh; h++) {
      const u = h / Hh, r = (1.2 + h * 0.36) * (1 - k * 0.6)
      const cx = ox + Math.sin(h * 0.25 - t * 2.2) * (0.6 + u * 1.6) * (1 - k)   // 柱の芯の揺れ（上ほど大きい）
      const y = Math.round(base - 1 - h + (oy - (base - 1 - h)) * lift * (1 - u * 0.5))
      for (let xx = -Math.ceil(r); xx <= Math.ceil(r); xx++) {
        const e = xx / r
        if (Math.abs(e) > 1) continue
        const band = 0.5 + 0.5 * Math.sin(Math.asin(e) * 2 - t * sp + h * 0.45)   // 回る帯（手前を回って見える）
        let a = dens * (1 - u) ** 1.3 * Math.sqrt(1 - e * e) * (0.35 + 0.65 * band)
        a = Math.min(4, Math.round(a * 4)) / 4 * 0.8
        if (a <= 0) continue
        const c = k > 0.55 ? (band > 0.5 ? P.ye2 : P.or2) : k > 0.25 ? P.or1 : u < 0.35 ? P.br2 : band > 0.6 ? P.br3 : P.br2   // 下ほど濃い塵の色。ためで火の色へ
        tint(Math.round(cx + xx), y, c, a)
      }
    }
    // 足もとの塵だまり（平たい楕円。回りながら、縁はゆるく揺れる）
    if (k < 0.8) for (let j = -1; j <= 1; j++) for (let i = -7; i <= 7; i++) {
      const e = Math.hypot(i / (6 + Math.sin(t * 3 + j) * 1), j / 1.8)
      if (e > 1) continue
      const a = Math.round((1 - e) * (0.8 + near * 0.2) * (1 - k) * (0.6 + 0.4 * Math.sin(Math.atan2(j, i) * 3 - t * sp)) * 4) / 4 * 0.75
      if (a > 0) tint(Math.round(ox + i), Math.round(base - 1 + j), P.br2, a)
    }
    // 枯れ葉と塵の粒（不透明。回る向きに尾）
    const n = 6 + Math.round(near * 3)
    for (let i = 0; i < n; i++) {
      const ph = (t * (0.3 + near * 0.2) + i / n) % 1, h = ph * Hh
      const r = (2 + h * 0.4) * (1 - k * 0.7), a = t * sp + i * 2.4
      let x = ox + Math.cos(a) * r, y = base - 1 - h + Math.sin(a) * r * 0.3
      x += (ox - x) * k * k; y += (oy - y) * k * k
      const hot = k > 0.6 ? P.ye2 : k > 0.3 ? P.or2 : hash(i, Math.floor(t * 1.5), b.w.index) < 0.1 ? P.or2 : null
      px(Math.round(x), Math.round(y), hot ?? (i % 3 ? P.br1 : P.br2))
      if (i % 3 === 0 && !hot) px(Math.round(x - Math.sin(a) * 1.3), Math.round(y + Math.cos(a) * 0.4), P.br3)   // 枯れ葉は 2 ドット
      if (hot) addLight(Math.round(x), Math.round(y), P.or2, 0.15)
    }
    // ための光は付けない（明るい背景では白いもやになる。熱は色づく粒と柱の色で見せる）
  }

  // 追う・燃え尽きる: 炎の舌と陽炎（跡に沿う）、床の光
  const drawBody = (b, world, camX, camY, t) => {
    const fadeK = b.st === 'fade' ? Math.min(1, b.t / WIND.fade) : 0, heat = b.heat
    const pts = along(b.trail), n = pts.length
    // 炎の舌: 内の 3 本は太く（2 ドット）、外の 2 本は淡い陽炎（切れ切れ）。尾へ向かって広がり、しなり、先がちらつく
    if (n > 2) for (let i = 0; i < 5; i++) {
      const off0 = (i - 2) * 3, outer = i === 0 || i === 4
      const m = Math.floor(n * (0.55 + 0.3 * hash(i, b.w.index, 5) + 0.15 * Math.sin(t * 9 + i * 2.1)) * (1 - fadeK * 0.35))
      for (let s = Math.abs(off0); s < m; s++) {
        const u = s / n, q = pts[s]
        if (outer && ((s + Math.floor(t * 24)) % 4) < 2) continue
        if (fadeK > 0 && hash(s, i * 7 + b.w.index, 21) < fadeK * 1.15) continue   // 消える間: 形のまま、ばらけて減っていく（どの点が消えるかは決まっていて、ちらつかない）
        if (u > 0.6 && hash(s, i, Math.floor(t * 20)) < (u - 0.6) * 1.8) continue   // 尾はちぎれる
        const o = off0 * (1 + u * 1.4) + Math.sin(u * 6 - t * 12 + i * 1.3) * u * 5.5
        const x = Math.round(q.x + q.nx * o - camX), y = Math.round(q.y + q.ny * o - camY)
        // 先頭の白い熱い所（2026-11-07）: 内の舌の頭を長めに白く（真ん中は 2〜3 割、両わきは 1〜2 割。冷めるほど縮む）。
        //   真ん中の舌は、とがった先から 3 ドットに太り、尾へ細くなる（くさびの形。丸くすると火の玉に見える）
        const white = heat > 0.25 && u < (i === 2 ? 0.27 : 0.15) * heat
        const c = outer ? (heat < 0.25 ? P.gy5 : P.ye3) : white ? P.white : fire(u * 0.9 + (i === 2 ? 0.08 : 0.2), heat)
        px(x, y, c)
        const wide = i === 2 ? (u < 0.03 ? 1 : u < 0.3 ? 3 : u < 0.55 ? 2 : 1) : !outer && u < 0.7 ? 2 : 1
        for (let w = 1; w < wide; w++) {
          const sg = w === 1 ? Math.sign(o || 1) : -Math.sign(o || 1)   // 2 本目は反対側へ（真ん中を軸に太る）
          px(Math.round(x + q.nx * sg), Math.round(y + q.ny * sg), white && u < 0.2 * heat ? P.white : fire(u * 0.9 + 0.25, heat))
        }
        // 白い所の縁: 両側に黄色を 1 ドット（明るい町の背景に白が溶けないように）
        if (white && i === 2) for (const sg of [1, -1]) { const d = sg * (wide >= 3 ? 2 : 1) + (wide === 2 ? (Math.sign(o || 1) > 0 ? (sg > 0 ? 1 : 0) : (sg < 0 ? -1 : 0)) : 0); px(Math.round(x + q.nx * d), Math.round(y + q.ny * d), P.ye2) }
        if (!outer && i === 2 && s % 3 === 0) addLight(x, y, P.or2, 0.1 * step3(heat * (1 - u)))
      }
    }
    // 頭（巻きは描かない。2026-11-07 に本人と決めた。追う間の巻きは不自然だった）。光だけ控えめに
    const vx = b.vx, vy = b.vy, v = Math.hypot(vx, vy) || 1, dx = vx / v, dy = vy / v
    const cx = b.x - dx * 6 - camX, cy = b.y - dy * 6 - camY
    glowAt(Math.round(cx), Math.round(cy), 8, 0.06 * step3(heat))   // 光は控えめ（強いと明るい背景で白い玉になり、火の玉に見える）
    // 床の光: 頭の下の地面に、平たく（近いほど強い）
    const g = groundBelow(world, b.x, b.y)
    if (g != null) {
      const near = 1 - (g - b.y) / (6 * TILE), gy = g - camY
      if (near > 0) for (let i = -14; i <= 14; i++) for (let j = 0; j < 3; j++) { const k = 1 - Math.abs(i) / 14 - j * 0.25; if (k > 0) addLight(Math.round(cx + i), gy - 1 + j, P.or2, 0.22 * step3(k * near * heat)) }
    }
    // 放つ: 白い決めのコマ（2 コマ）と、はじける輪
    if (b.st === 'blow' && b.t < 0.3) {
      const k = b.t / 0.3, R = 6 + k * 24
      if (b.t < 0.05) for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) if (i * i + j * j <= 36) px(Math.round(b.x - camX + i), Math.round(b.y - camY + j), P.white)
      for (let a = 0; a < Math.PI * 2; a += 1 / R) {
        if (hash(Math.round(a * 40), 3, 11) < k * 0.7) continue
        px(Math.round(b.x - camX + Math.cos(a) * R), Math.round(b.y - camY + Math.sin(a) * R * 0.8), k < 0.3 ? P.white : k < 0.6 ? P.ye2 : P.or2)
      }
      glowAt(Math.round(b.x - camX), Math.round(b.y - camY), 14, 0.14 * step3(1 - k))
    }
  }

  // 壁に当たった: 炎が面に沿って平たく広がって消える。焦げ跡はしばらく残る
  const drawCrash = (b, camX, camY, t) => {
    const k = b.st === 'crash' ? Math.min(1, b.t / WIND.crash) : 1, [nx, ny] = b.n, tx = -ny, ty = nx
    const cx = b.x - camX, cy = b.y - camY
    // 焦げ跡（壁の面の 1〜2 ドット内側）: 消えたあと 4 秒かけて薄れる
    const left = b.st === 'gone' ? 1 - b.t / 4 : 1
    if (left > 0) for (let s = -11; s <= 11; s++) {
      if (hash(s, 7, b.w.index) > 0.65 * (1 - Math.abs(s) / 14) || hash(s, 8, b.w.index) > left) continue
      for (let d = 1; d <= (Math.abs(s) < 5 ? 2 : 1); d++) px(Math.round(cx + tx * s - nx * d), Math.round(cy + ty * s - ny * d), d === 1 ? P.br0 : P.br1)
    }
    if (b.st !== 'crash') return
    // 広がる炎: 面から外へ立つ舌。真ん中が高く、端へ低く。広がりながら低くなる
    const spread = 4 + Math.sqrt(k) * 18
    for (let s = -Math.floor(spread); s <= spread; s++) {
      if (hash(s, Math.floor(t * 20), 12) < 0.18) continue
      const hgt = (1 - Math.abs(s) / spread) ** 0.7 * 10 * (1 - k) * (0.6 + 0.4 * hash(s, Math.floor(t * 15), 13))
      for (let j = 0; j < hgt; j++) {
        const sway = Math.sin(j * 0.6 + t * 12 + s) * j * 0.12
        px(Math.round(cx + tx * (s + sway) + nx * j), Math.round(cy + ty * (s + sway) + ny * j), fire(j / Math.max(1, hgt) * 0.8 + k * 0.4, Math.max(0.3, b.heat)))
      }
    }
    glowAt(Math.round(cx + nx * 3), Math.round(cy + ny * 3), 12, 0.12 * step3(1 - k))
  }

  const drawEmbers = (b, camX, camY) => {
    for (const e of b.embers) {
      const k = e.t / e.life, x = Math.round(e.x - camX), y = Math.round(e.y - camY)
      px(x, y, k < 0.2 ? P.white : k < 0.45 ? P.ye2 : k < 0.75 ? P.or2 : P.rd2)
      if (e.big && k < 0.5) px(x, y - 1, k < 0.25 ? P.ye2 : P.or2)   // 大きい火の粉（縦に 2 ドット）
      if (k < 0.5) addLight(x, y, P.or2, 0.2)
    }
  }

  const drawWinds = (S, camX, camY, t) => {
    const p = S.player
    for (const b of S.winds || []) {
      if (b.st === 'idle' || b.st === 'gather') {
        const d = p ? Math.hypot(p.x - b.w.x, p.y - 8 - b.w.y) : 1e9
        drawWhirl(b, S.world, camX, camY, t, Math.max(0, Math.min(1, 1 - (d - WIND.wake) / 80)), b.st === 'gather' ? Math.min(1, b.t / WIND.gather) : 0)
      } else if (b.st === 'blow' || b.st === 'fade') drawBody(b, S.world, camX, camY, t)
      else if (b.n) drawCrash(b, camX, camY, t)   // crash と、壁で消えたあとの焦げ跡
      drawEmbers(b, camX, camY)
    }
  }
  return { drawWinds }
}
