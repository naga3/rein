// 効果: 地面を蹴る土ぼこり・鬼火、死んだ所の花と花びら、光を見つけた輪、岩が崩れる、噴火口の炎
import { P } from '../palette.js'
import { TILE, JET, K } from '../world.js'
import { ART } from '../art.js'
import { W, H, hash, dither, turnAround } from './base.js'

export function makeEffects({ fb, px, blend, addLight, artPic, artBlit, animFrame, setTurn }) {
  // 死んだ所の花は、Pixel の絵（flower/carnation）で咲かせる（grow のコマを順に、そのあと wind で揺れる）
  //   天の道で落ちた所の花（kind: 'mandarava'。曼陀羅華）は、白と金色がまじって咲く（長部注に金色と読める所がある。色は経に無い）
  //   Pixel の deva/mandarava（白で描き、カーネーションと同じ文字）。金色はゲームが塗り替える
  const MANDARAVA_GOLD = { r: P.ye1, R: P.ye2, w: P.ye3, D: P.or2 }
  const flowerArt = (f, sx, sy, i, time) => {
    const mand = f.kind === 'mandarava', ref = mand ? 'deva/mandarava' : 'flower/carnation'
    const a = ART[ref]
    if (!a) return
    const grow = a.anims.grow, total = grow ? grow.ms.reduce((x, y) => x + y, 0) / 1000 : 0
    let name
    if (grow && f.t < total) name = animFrame(ref, 'grow', f.t)
    else name = animFrame(ref, 'wind', time + i * 0.37) || 'bloom'
    const pic = artPic(ref, name) || artPic(ref, 'bloom')
    if (!pic) return
    const gold = mand && Math.round(f.x / 7 + f.life) % 2 === 0
    artBlit(pic, sx + 5 - (pic.rows[0].length >> 1), sy + 14 - pic.rows.length, false, mand && gold ? MANDARAVA_GOLD : null)
  }

  // 再び人は、継ぎ目の両側の写しにも、一周ずらして同じように描く（花・誘うもの）
  //   写しは継ぎ目から 1 画面ぶんだけ（道の始まりの 20 列は終わりの先に、終わりの 20 列は始まりの手前に）
  const loopOffsAt = (world, x) => { const lp = world.loop; if (!lp) return [0]; const o = [0]; if (x >= lp.x0 && x < lp.x0 + 20 * TILE) o.push(lp.len); if (x >= lp.x0 + lp.len - 20 * TILE && x < lp.x0 + lp.len) o.push(-lp.len); return o }   // 一周の中のものだけ写す（写しの場所や、継ぎ目より先のものは写さない）
  // 花（前の生で死んだ所）。同じ所の花は少しずつずらして束にする
  const drawFlowers = (S, world, camX, camY) => {
    S.flowers.forEach((f, i) => {
      const ox = Math.round((hash(i, 3) - 0.5) * 10), oy = Math.round(hash(i, 4) * 3)
      for (const o of loopOffsAt(world, f.x)) {
        if (f.t < 0) continue
        if (f.dir) {
          // 天井・壁の針から咲く花（2026-11-05）: 針と同じ向きに回す。ずらすのは面に沿ってだけ、針の列の中で（面には沈めない）
          const ax = Math.round(f.x + o - camX), ay = Math.round(f.y - camY), sh = Math.round(ox * 0.6)
          if (ax < -20 || ay < -20 || ax > W + 20 || ay > H + 20) continue
          const bx = ax + 5, by = ay + 13
          //   根もとは面から LIFT ドット浮かせる（針の根もとの密な所に隠れるので浮いては見えない。面にぴったりだと花の頭が針に埋もれる）
          const LIFT = 4
          setTurn(turnAround(f.dir, bx, by, f.dir === 'down' ? ax + sh : f.dir === 'right' ? ax + LIFT : ax - 1 - LIFT, f.dir === 'down' ? ay + LIFT : ay + sh))
          flowerArt(f, bx - 5, by - 13, i, S.time)
          setTurn(null)
          continue
        }
        const sx = Math.round(f.x + o - camX) - 5 + ox, sy = Math.round(f.y - camY) - 14 + oy
        if (sx < -14 || sy < -16 || sx > W + 4 || sy > H + 4) continue
        flowerArt(f, sx, sy, i, S.time)
      }
    })
  }

  // 花びら（死んだ瞬間）
  const drawPetals = (S, camX, camY) => {
    //   ひらひら返る: 表（赤）と裏（桃）が入れ替わり、大きい花びらは横向き 2 ドット ↔ 縦向きに見える。終わりは暗くなって、またたいて消える
    for (const pt of S.petals) {
      if (pt.t < 0) continue
      const u = pt.t / pt.life, f = Math.sin(pt.t * 9 + pt.ph), late = u > 0.75
      if (u > 0.9 && Math.floor(pt.t * 30) % 2) continue
      const x = Math.round(pt.x - camX), y = Math.round(pt.y - camY)
      const face = f > 0 ? (late ? P.rd2 : P.rd3) : late ? P.pk1 : P.pk2
      px(x, y, pt.t < 0.06 ? P.white : face)
      // 大きい花びら: 開いた面（横 2 ドット＋下に 1）↔ 縁が見える（縦 1 ドット）
      if (pt.big && Math.abs(f) > 0.35) { px(x + (f > 0 ? 1 : -1), y, late ? P.rd1 : f > 0 ? P.pk3 : P.rd2); px(x, y + 1, late ? P.rd1 : P.rd2) }
    }
  }

  // 地面を蹴った効果（player.js の groundKick）。色は道の地面に合わせる（土ぼこり: 影・中・明るい上）
  const DUST = { hell: [P.gy2, P.gy3, P.gy4], animal: [P.br2, P.br3, P.br4], peta: [P.br3, P.br4, P.br5], human: [P.br2, P.br3, P.br4], deva: [P.gy5, P.gy6, P.white], human2: [P.gy3, P.gy4, P.gy5] }
  const drawPuff = (k, camX, camY) => {
    const [c0, c1, c2] = DUST[k.realm] || DUST.hell
    const cx = Math.round(k.x - camX), cy = Math.round(k.y - camY)
    // 放つ瞬間: 足もとに白い線（2 コマ）
    if (k.t < 2 / 60) for (let i = -3; i <= 3; i++) px(cx + i, cy - 1, Math.abs(i) < 2 ? P.white : c2)
    // 地面を走る線: 蹴った側へ、足もとから伸びて、根もとから縮んで消える（0.12 秒）。上下に 2 本、長さ違い
    if (k.t < 0.12) {
      const u = k.t / 0.12
      for (const side of k.sides) for (const [dy, len] of [[-1, 9], [-3, 5]]) {
        const a0 = Math.round(2 + len * u * 0.9), a1 = Math.round(2 + len * Math.min(1, u * 2.5))
        for (let i = a0; i <= a1; i++) px(cx + side * i, cy + dy, u < 0.3 ? P.white : i > a1 - 2 ? c2 : c1)
      }
    }
    // 土ぼこり: 小さな半透明の塊。膨らみながら薄れる（上が明るい）
    k.dust.forEach((d) => {
      const u = (k.t - d.delay) / d.life
      if (u < 0 || u >= 1) return
      const r = d.r0 + u * 1.6, x = d.x - camX, y = d.y - camY, al = 0.65 * (1 - u)
      for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) {
        if (i * i + j * j > r * r + 0.5) continue
        blend(Math.round(x + i), Math.round(y + j), j < 0 ? c2 : c1, al)
      }
    })
    // 粒: 1 ドット。速いうちは尾を引く
    for (const g of k.grit) {
      if (k.t > g.life) continue
      const x = Math.round(g.x - camX), y = Math.round(g.y - camY)
      px(x, y, k.t < 0.08 ? P.white : c2)
      if (!g.rest && Math.abs(g.vx) > 30) px(x - Math.sign(g.vx), y, c1)
    }
  }
  // 鬼火（src/player.js の wisp）。生まれは白い芯の小さな炎、昇るにつれて細く青くなり、最後はまたたいて消える。先は揺らぐ
  const drawWisp = (w, camX, camY) => {
    const u = w.t / w.life
    const sway = Math.sin(w.t * 14 + w.phase) * (0.6 + u)
    const x = Math.round(w.x - camX), y = Math.round(w.y - camY), tx = Math.round(w.x - camX + sway)
    if (u < 0.4 && w.big) {
      // しずくの形の炎: 下が丸く白い芯、上へ細く青く
      px(x - 1, y, P.bl3); px(x + 1, y, P.bl3); px(x, y, P.white)
      px(x - 1, y - 1, P.bl4); px(x + 1, y - 1, P.bl4); px(x, y - 1, P.white)
      px(x, y - 2, P.bl5); px(tx, y - 3, P.bl4); px(tx, y - 4, P.bl2)
    } else if (u < 0.65) {
      px(x, y, u < 0.35 ? P.white : P.bl5); px(tx, y - 1, P.bl4); if (w.big) px(tx, y - 2, P.bl2)
    } else if (Math.floor(w.t * 30 + w.phase) % 2) px(tx, y, u < 0.85 ? P.bl4 : P.bl2)
  }

  // 死んで花びらがはじける瞬間（S.bloom。体が白く止まったあと）: 白い閃光 → 8 本の光の筋が外へ走る → 桃色の輪が広がって欠ける。きらめきがまたたく
  const drawBloom = (b, camX, camY) => {
    const t = b.t, cx = b.x - camX, cy = b.y - camY
    const P2 = (x, y, c) => px(Math.round(cx + x), Math.round(cy + y), c)
    if (t < 0.05) for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) { const d = x * x + y * y; if (d <= 16) P2(x, y, d <= 6 ? P.white : P.pk3) }
    if (t < 0.2) {
      const v = t / 0.2, r1 = 6 + v * 16, len = Math.max(1, 7 * (1 - v))
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.2
        for (let r = r1 - len; r <= r1; r += 1) P2(Math.cos(a) * r, Math.sin(a) * r, v < 0.35 ? P.white : r > r1 - 1.5 ? P.pk3 : P.pk2)
      }
    }
    if (t < 0.3) {
      const u = t / 0.3, r = 3 + 11 * (1 - (1 - u) ** 3), n = Math.ceil(r * 6)
      const c = u < 0.15 ? P.white : u < 0.4 ? P.pk3 : u < 0.7 ? P.pk2 : P.rd2
      for (let i = 0; i < n; i++) {
        if (u > 0.4 && hash(i, b.seed, 8) < (u - 0.4) * 1.7) continue
        const a = (i / n) * Math.PI * 2
        P2(Math.cos(a) * r, Math.sin(a) * r, c)
      }
    }
    for (let k = 0; k < 7; k++) {
      const t0 = 0.05 + hash(k, b.seed, 9) * 0.35, w = (t - t0) / 0.28
      if (w < 0 || w >= 1 || (w > 0.6 && Math.floor(t * 30 + k) % 2)) continue
      const a = hash(k, b.seed, 10) * 6.28, r = 7 + hash(k, b.seed, 11) * 15, x = Math.cos(a) * r, y = Math.sin(a) * r - w * 4
      P2(x, y, P.white)
      if (w < 0.5) { P2(x - 1, y, P.pk3); P2(x + 1, y, P.pk3); P2(x, y - 1, P.pk3); P2(x, y + 1, P.pk3) }
    }
  }


  // 光の部屋を見つけた瞬間（S.discover）: 画面がぱっと白く光って引く → 体から光の輪が二重に広がる。濃さは市松の細かさで段にする（4 段）
    const drawDiscover = (d, camX, camY) => {
    const t = d.t, cx = d.x - camX, cy = d.y - camY
    // 閃光: 0.25 秒で、べた → 市松 → 粗い市松と引く
    if (t < 0.25) { const level = 4 - Math.floor((t / 0.25) * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dither(x, y, level)) fb[y * W + x] = P.white }
    // 輪: 二重に、少しずらして
    for (const [t0, rmax] of [[0.02, 70], [0.16, 48]]) {
      const u = (t - t0) / 0.6
      if (u < 0 || u >= 1) continue
      const r = 4 + rmax * (1 - (1 - u) ** 3), n = Math.ceil(r * 6), c = u < 0.3 ? P.bl3 : u < 0.6 ? P.bl4 : P.bl5
      for (let i = 0; i < n; i++) {
        if (u > 0.45 && hash(i, d.seed + t0 * 100, 14) < (u - 0.45) * 1.8) continue
        const a = (i / n) * Math.PI * 2
        px(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), c)
      }
    }
  }


  // すり抜けの岩が開く: 岩のかけら（暗い岩の色、上に明るい縁）が転がり落ちて跳ねる → 土ぼこりが膨らみながら薄れる
  const drawCrumble = (c, camX, camY) => {
    const t = c.t
    // 土ぼこり: 柔らかい塊。上が明るく、膨らみながら、色が背景へ沈み、縁から不規則に欠けて消える（市松にはしない）
    for (const [n, d] of c.dust.entries()) {
      const u = (t - d.delay) / d.life
      if (u < 0 || u >= 1) continue
      const r = d.r0 + u * 4, body = u < 0.35 ? P.gy3 : u < 0.7 ? P.gy2 : P.gy1, lit = u < 0.35 ? P.gy4 : u < 0.7 ? P.gy3 : P.gy2
      for (let y = -Math.ceil(r); y <= r; y++) for (let x = -Math.ceil(r); x <= r; x++) {
        const q = (x * x + y * y) / (r * r)
        if (q > 1 || hash(x + n * 17, y, 23) < u * 0.9 + q * 0.5 - 0.35) continue
        px(Math.round(d.x - camX + x), Math.round(d.y - camY + y), y < -r * 0.35 ? lit : body)
      }
    }
    // かけら
    for (const k of c.chunks) {
      if (t > k.life || (t > k.life - 0.25 && Math.floor(t * 24) % 2)) continue
      const x = Math.round(k.x - camX), y = Math.round(k.y - camY)
      px(x, y, P.gy4); if (k.big) { px(x + 1, y, P.gy3); px(x, y + 1, P.gy3); px(x + 1, y + 1, P.gy2) }
    }
  }

  const SHAKE = { amp: 4, time: 0.28 }

  // 噴き出す炎
  // 噴火口と炎（ref/pixelfx-ideas.md の考え方: ため → 放つ〈白い決めのコマ〉→ 広がる → 残る → 長い消え際。線と光。出は速く、引きはゆっくり）
  //   周期は world.js の JET（休み → 予兆 warn 秒 → 噴く on 秒）。当たりは口から上へ JET.height タイル、横は口の 3〜13 ドット（見た目をそれに合わせる）
  //   口: Pixel の tiles/vent。g の文字は口の奥の熱い所で、休み・予兆・噴くで色を替える
  const ventPic = () => artPic('tiles/vent', 'vent')
  const drawVent = (sx, sy, glow, shake) => {
    const pic = ventPic()
    if (pic) artBlit(pic, sx + shake, sy, false, { ...pic.colors, g: glow })
  }
  // その周期の中のどこか: { st: off|warn|on, k: その段に入ってからの秒, after: 噴き終わってからの秒（休みの間）, cyc: 何周目 }
  const jetPhase = (j, time) => {
    const cyc = Math.floor(time / JET.period + j.phase), f = (time / JET.period + j.phase - cyc) * JET.period, offEnd = JET.period - JET.warn - JET.on
    if (f < offEnd) return { st: 'off', k: f, after: f, cyc }
    if (f < offEnd + JET.warn) return { st: 'warn', k: f - offEnd, cyc }
    return { st: 'on', k: f - offEnd - JET.warn, cyc }
  }
  const lerpSteps = (list, u) => list[Math.max(0, Math.min(list.length - 1, Math.floor(u * list.length)))]
  const drawJet = (j, sx, sy, t) => {
    const ph = jetPhase(j, t), hgt = JET.height * TILE, cx = sx + 8, mouth = sy + 2
    const seed = j.x * 31 + j.y * 7 + ph.cyc * 131
    // 口の奥の色: 休みは暗い赤（噴いた直後は少しずつ冷める）、予兆はだんだん明るく（3 段）、噴く間は黄と白
    let glow = P.rd0
    if (ph.st === 'warn') glow = lerpSteps([P.rd1, P.rd2, P.or1, P.or2], ph.k / JET.warn)
    else if (ph.st === 'on') glow = Math.floor(t * 30) % 2 ? P.ye3 : P.white
    else if (ph.after < 0.5) glow = lerpSteps([P.or2, P.or1, P.rd2, P.rd1], ph.after / 0.5)
    // 光: まわりに暖かい光だまり（段に刻む。予兆は口のまわりだけ、噴く間は柱のまわりに広く）
    const light = (rx, ry, oy, a) => {
      for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
        const d = (x * x) / (rx * rx) + (y * y) / (ry * ry)
        if (d > 1) continue
        const lv = d < 0.25 ? 3 : d < 0.55 ? 2 : 1
        if ((x + y) % 2 && lv === 1) continue
        addLight(cx + x, oy + y, P.or2, a * lv / 3)
      }
    }
    if (ph.st === 'warn') light(6 + Math.round(ph.k / JET.warn * 6), 4, mouth, 0.15 + 0.2 * ph.k / JET.warn)
    if (ph.st === 'on') { light(13, hgt / 2 + 4, mouth - hgt / 2, 0.2); light(18, 5, mouth, 0.3) }   // 柱に沿った細い光と、足もとの床の照り返し
    if (ph.st === 'off' && ph.after < 0.4) light(9, 8, mouth - 4, 0.2 * (1 - ph.after / 0.4))
    // 口は揺らさない（2026-11-05。予兆の終わりぎわに左右へ揺らしていたが、両側の壁とのつなぎ目がずれて見えた。予兆は奥の灯りと火の粉で）
    const shake = 0
    drawVent(sx, sy, glow, shake)
    // 予兆: 火の粉がぱらぱら昇る（終わりに近いほど多い）
    if (ph.st === 'warn') {
      const n = 2 + Math.floor((ph.k / JET.warn) * 7)
      for (let i = 0; i < n; i++) {
        const born = hash(i, seed, 1) * JET.warn, age = (ph.k - born + JET.warn) % JET.warn, life = 0.25 + hash(i, seed, 2) * 0.2
        if (age > life) continue
        const x = cx - 4 + hash(i, seed, 3) * 8 + Math.sin(age * 20 + i) * 1.5, y = mouth - age * (30 + hash(i, seed, 4) * 40)
        px(Math.round(x), Math.round(y), age < life * 0.4 ? P.ye3 : age < life * 0.75 ? P.or2 : P.rd2)
      }
    }
    // 噴く: 炎の柱。芯は白〜黄、中は橙、縁は赤。下から上へ流れる筋、上ほど細く、先は千切れて揺れる
    if (ph.st === 'on' || (ph.st === 'off' && ph.after < 0.3)) {
      const on = ph.st === 'on'
      const grow = on ? Math.min(1, ph.k / 0.07) : 1                    // 出は速く（0.07 秒で上まで）
      const top = Math.round(hgt * grow)
      const cut = on ? 0 : Math.round(hgt * (ph.after / 0.3) * 1.2)     // 引き: 下から先に消え、上が少し残る
      const cool = on ? Math.max(0, (ph.k - JET.on + 0.2) / 0.2) : 1     // 終わりぎわは色が冷める
      for (let y = cut; y < top; y++) {
        const v = y / hgt
        const w = 5.5 - v * 2.5 + Math.sin(y * 0.55 + t * 28) * 1.1 + Math.sin(y * 0.21 - t * 17) * 0.8
        for (let x = -Math.ceil(w); x <= Math.ceil(w); x++) {
          if (Math.abs(x) > w) continue
          const flow = hash(x + 9, Math.floor(y * 0.5 + t * 55), seed)        // 下から上へ流れる筋
          let heat = (1 - v) * 0.8 + (1 - Math.abs(x) / w) * 0.6 + flow * 0.35 - 0.35 - cool * 0.4
          if (v > 0.75 && hash(x, Math.floor(y / 3 + t * 20), seed + 3) < (v - 0.75) * 3) continue   // 先は千切れる
          const c = heat > 0.95 ? P.white : heat > 0.75 ? P.ye3 : heat > 0.5 ? P.ye2 : heat > 0.25 ? P.or2 : heat > 0.05 ? P.or1 : P.rd2
          px(cx + x, mouth - y, c)
        }
      }
      // 先から千切れて昇る炎の舌（小さな塊）
      for (let i = 0; i < 4; i++) {
        const u = ((on ? ph.k : JET.on + ph.after) * (2.2 + hash(i, seed, 8)) + hash(i, seed, 9)) % 1
        const y = mouth - top - u * 14, x = cx + (hash(i, seed, 10) - 0.5) * 8 + Math.sin(u * 9 + i) * 2
        if (top < hgt * 0.9 || u > 0.85) continue
        const c = u < 0.3 ? P.ye2 : u < 0.6 ? P.or2 : P.rd2
        px(Math.round(x), Math.round(y), c); px(Math.round(x), Math.round(y) + 1, c)
      }
    }
    // 放つ瞬間: 白い決めのコマ（2 コマ）。口の上に白い閃光と、横に走る白い線
    if (ph.st === 'on' && ph.k < 2 / 60) {
      for (let i = -9; i <= 9; i++) px(cx + i, mouth - 1, Math.abs(i) < 6 ? P.white : P.ye3)
      for (let y = 0; y < 10; y++) for (let x = -3; x <= 3; x++) if (Math.abs(x) < 3 - y / 4) px(cx + x, mouth - 2 - y, P.white)
    }
    // 火の粉: 噴く間に口から飛び出し、上で散って、ゆっくり落ちながら暗くなる（噴き終わってからも少し残る）
    {
      const tt = ph.st === 'on' ? ph.k : ph.st === 'off' ? JET.on + ph.after : -1
      if (tt >= 0) for (let i = 0; i < 10; i++) {
        const born = hash(i, seed, 20) * JET.on * 0.9, age = tt - born, life = 0.6 + hash(i, seed, 21) * 0.6
        if (age < 0 || age > life) continue
        const vx = (hash(i, seed, 22) - 0.5) * 50, vy = 110 + hash(i, seed, 23) * 80
        const x = cx + vx * age, y = mouth - (vy * age - 140 * age * age)
        const u = age / life
        if (u > 0.7 && Math.floor(t * 30 + i) % 2) continue   // 消えぎわはまたたく
        px(Math.round(x), Math.round(y), u < 0.2 ? P.white : u < 0.45 ? P.ye3 : u < 0.7 ? P.or2 : P.rd1)
      }
    }
    // 煙: 噴き終わると、口から薄い煙が昇り、膨らみながら消える（半透明の塊。上が明るい）
    if (ph.st === 'off' && ph.after < 1.0) for (let i = 0; i < 3; i++) {
      const age = ph.after - i * 0.12, life = 0.8
      if (age < 0 || age > life) continue
      const u = age / life, r = 2 + u * 4, x = cx + (hash(i, seed, 30) - 0.5) * 6 + Math.sin(age * 3 + i) * 2, y = mouth - 4 - age * 22
      for (let yy = -Math.ceil(r); yy <= Math.ceil(r); yy++) for (let xx = -Math.ceil(r); xx <= Math.ceil(r); xx++) if (xx * xx + yy * yy <= r * r) blend(Math.round(x + xx), Math.round(y + yy), yy < 0 ? P.gy5 : P.gy4, 0.3 * (1 - u))
    }
  }


  // 岩が崩れた瞬間の光（reveal は S.reveal）
  const drawRevealFlash = (reveal) => {
    // 岩が崩れた瞬間、画面全体がふわっと白っぽくなる（2026-11-05。光の層）: まっ白に飛ばすフラッシュは気持ち悪かったのでやめた。
    //   崩れた瞬間に一様にうっすら白く、0.6 秒で 4 段に引く。岩の中の看板が出てきたときは金色で少し強め
    if (reveal) {
      const c = reveal, u = c.t
      const lv = u < 0.05 ? 1 : u < 0.15 ? 0.75 : u < 0.3 ? 0.5 : u < 0.45 ? 0.3 : u < 0.6 ? 0.12 : 0
      if (lv > 0) { const a = (c.sign ? 0.4 : 0.32) * lv, col = c.sign ? P.ye3 : P.white; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) addLight(x, y, col, a) }
    }
  }
  const shakeScreen = (reveal) => {
    // すり抜けの岩が開いた瞬間、画面が揺れる（縦横に最大 4 ドット、0.28 秒で収まる）。カメラは動かさず、描き終わった画面をずらす（はみ出した端は端の色で埋める。部屋の外は見えない）。文字は揺らさない
    if (reveal && reveal.t < SHAKE.time) {
      const k = 1 - reveal.t / SHAKE.time, f = Math.floor(reveal.t * 60)
      const dx = Math.round((hash(f, 3, 19) - 0.5) * 2 * SHAKE.amp * k), dy = Math.round((hash(f, 4, 19) - 0.5) * 2 * SHAKE.amp * 0.7 * k)
      if (dx) for (let y = 0; y < H; y++) {
        const row = fb.subarray(y * W, (y + 1) * W)
        if (dx > 0) { row.copyWithin(dx, 0, W - dx); row.fill(row[dx], 0, dx) }
        else { row.copyWithin(0, -dx, W); row.fill(row[W - 1 + dx], W + dx, W) }
      }
      if (dy > 0) { fb.copyWithin(dy * W, 0, (H - dy) * W); for (let y = 0; y < dy; y++) fb.copyWithin(y * W, dy * W, (dy + 1) * W) }
      else if (dy < 0) { fb.copyWithin(0, -dy * W, H * W); for (let y = H + dy; y < H; y++) fb.copyWithin(y * W, (H + dy - 1) * W, (H + dy) * W) }
    }
  }

  // 祝福の花びら（2026-11-06）: 見つけた光の部屋に、花びらが舞い落ち続ける（天が花を降らせて祝う）。見つけたあとの部屋に入ったときも。
  //   部屋の上の端より上から、ゆっくり落ちながら左右に揺れ、くるくる向きを変える（姿は 12 fps 前後で、一枚ずつ速さが違う）。
  //   速さ・揺れ・回り方・色は一枚ずつばらばら。ときどき日を受けてきらっと光る（光の層）。岩の上には描かない（岩の奥を落ちていく）。
  //   見つけた瞬間（S.bless）は、部屋じゅうの上から多めの花びらが一度だけ、少し速く降る
  // 花びらの姿（d 濃い縁・b 体・t 明るい先）。平ら → 傾く → 縁が見える → 反対へ傾く、と回って見える。明るい光の部屋でも見えるよう、濃い縁を付ける
  //   2026-11-06 に 2 倍ほどの大きさに（4 ドットほど。1 倍は明るい部屋で見えにくく、3 倍は大きすぎた）
  const PETAL_B = ['..tb', '.bbd', 'dd..']
  const PETAL_POSE = [
    ['.tbb', 'dbbd'],                               // 平ら
    PETAL_B,                                        // 傾く
    ['t', 'b', 'd'],                                // 縁が見える
    PETAL_B.map((row) => [...row].reverse().join('')),   // 反対へ傾く
  ].map((rows) => rows.flatMap((row, j) => [...row].map((ch, i) => (ch === '.' ? null : [i - (row.length >> 1), j - (rows.length >> 1), ch]))).filter(Boolean))
  const PETAL_COL = [{ d: P.pk1, b: P.pk2, t: P.pk3 }, { d: P.pk1, b: P.pk2, t: P.white }, { d: P.pk1, b: P.pk3, t: P.white }, { d: P.or1, b: P.ye2, t: P.ye3 }]
  const drawBlessing = (S, world, camX, camY) => {
    const r = S.room
    if (!r?.light || !S.found?.has(r.index)) return
    // 降り始めは、部屋の空いている所のいちばん上の少し上（上の方が岩の部屋でも、見つけた瞬間の花びらが岩に隠れないように）
    if (r.openTop == null) { let ty = r.y; while (ty < r.y + r.h - 1 && ![...Array(r.w)].some((_, i) => world.t[ty * world.w + r.x + i] === K.air)) ty++; r.openTop = ty }
    const x0 = r.x * TILE, y0 = r.openTop * TILE - 8, w = r.w * TILE, h = (r.y + r.h) * TILE - y0
    const solid = (wx, wy) => { const k = world.t[Math.floor(wy / TILE) * world.w + Math.floor(wx / TILE)]; return k === K.rock || k === K.hidden || k === K.door }
    const one = (i, wx, wy, seed, tt) => {
      const sx = Math.round(wx - camX), sy = Math.round(wy - camY)
      if (sx < -6 || sy < -6 || sx > W + 6 || sy > H + 6 || solid(wx, wy)) return
      const pose = PETAL_POSE[Math.floor(tt * (6 + hash(i, seed + 5) * 8) + hash(i, seed + 6) * 4) % 4]
      const col = PETAL_COL[Math.floor(hash(i, seed + 7) * PETAL_COL.length)]
      for (const [dx, dy, ch] of pose) px(sx + dx, sy + dy, col[ch])
      const glint = (tt / (3 + hash(i, seed + 8) * 3) + hash(i, seed + 9)) % 1 < 0.04
      if (glint) { px(sx, sy, P.white); addLight(sx, sy, P.ye3, 0.35); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) addLight(sx + dx, sy + dy, P.ye3, 0.12) }
    }
    const t = S.time
    // 降り続ける花びら（一部屋に 16 枚。落ちきったら上から）
    for (let i = 0; i < 16; i++) {
      const vy = 10 + hash(i, 101) * 12, amp = 3 + hash(i, 102) * 8, f = 0.6 + hash(i, 103) * 0.9
      const wy = y0 + ((hash(i, 104) * h + t * vy) % h)
      const wx = x0 + hash(i, 105) * w + Math.sin(t * f + i * 1.3) * amp + (wy - y0) * 0.08
      one(i, wx, wy, 100, t)
    }
    // 見つけた瞬間の花びら（一度だけ。40 枚が部屋の上から、少し速く。ばらばらに出る）
    if (S.bless?.room === r.index) {
      const since = t - S.bless.at
      if (since < 8) for (let i = 0; i < 40; i++) {
        const k = since - hash(i, 201) * 1.2
        if (k < 0) continue
        const vy = 22 + hash(i, 202) * 20, amp = 4 + hash(i, 203) * 10, f = 0.8 + hash(i, 204)
        const wy = y0 + k * vy
        if (wy > y0 + h) continue
        const wx = x0 + hash(i, 205) * w + Math.sin(k * f + i) * amp
        one(i + 100, wx, wy, 200, k)
      }
    }
  }
  // 魚が食べる（S.dead.eaten）: 水面の下から大きな口が一気に飛び出して開き（0.1 秒）→ 閉じる（白い歯の決めのコマ）→ ゆっくり沈む。しぶきと波紋が残る
  const drawJaws = (S, camX, camY) => {
    // JAW_SLOW: 動きの遅さ（2026-11-06 に 1.6 倍ゆっくり。速すぎて何が起きたか見えにくかった）
    const JAW_SLOW = 1.6, e = S.dead?.eaten, t = (S.dead?.t ?? 99) / JAW_SLOW
    if (!e || t > 1.6) return
    const cx = Math.round(e.x - camX), sf = Math.round(e.surface - camY)
    // Pixel の絵（animal/bigfish の open・bite・close。口が上、下の端は水の中）があれば、それを使う。無ければ下の仮の絵
    const fishArt = ART['animal/bigfish']
    if (fishArt) {
      const rise = t < 0.1 ? t / 0.1 : t < 0.22 ? 1 : Math.max(0, 1 - (t - 0.22) / 0.5)
      if (rise > 0) {
        const name = t < 0.14 ? 'open' : t < 0.22 && fishArt.pics.bite ? 'bite' : 'close'
        const pic = artPic('animal/bigfish', fishArt.pics[name] ? name : 'open')
        if (pic) {
          const pw = pic.rows[0].length, ph = pic.rows.length
          // いちばん上で、絵の 7 割ほどが水面より上（2026-11-06。6 割は低く、8 割は出すぎた）
          const x0 = cx - (pw >> 1), y0 = sf - Math.round(ph * 0.85 * rise) + 6
          // 水面より下は、深いほど薄く（4 段の半透明で、水面から 10 ドットで消える。下の端で切れて見えないように。2026-11-06）
          pic.rows.forEach((row, j) => [...row].forEach((ch, i) => {
            if (ch === '.') return
            const x = x0 + (e.dir < 0 ? pw - 1 - i : i), y = y0 + j, depth = y - (sf + 2)
            const a = depth <= 0 ? 1 : Math.ceil(Math.max(0, 1 - depth / 10) * 4) / 4
            if (a >= 1) px(x, y, pic.colors[ch]); else if (a > 0) blend(x, y, pic.colors[ch], a)
          }))
        }
      }
    } else {
    // 仮の絵: 下から口を上へ向けて飛び出す魚の頭。あごの付け根（hinge）から、上あご・下あごが V 字に開き、閉じる
    const rise = t < 0.1 ? t / 0.1 : t < 0.22 ? 1 : Math.max(0, 1 - (t - 0.22) / 0.5)
    const hy = sf + 26 - Math.round(rise * 20)                                 // あごの付け根
    const a = t < 0.12 ? 0.62 : t < 0.16 ? 0.62 - ((t - 0.12) / 0.04) * 0.56 : 0.06   // 開き（ラジアン）
    const snap = t >= 0.14 && t < 0.22, L = 15
    if (rise > 0) {
      for (let y = -L - 2; y <= 24; y++) for (let x = -14; x <= 14; x++) {
        let c = null
        // 体: 付け根から下の、丸い頭と胴（下ほど太く）
        if (y >= -3 && Math.abs(x) <= Math.min(8, 5 + (y + 3) * 0.5)) c = x * e.dir > 2 ? P.wt1 : P.bl1   // 腹の側は明るい
        // あご: 付け根から斜め上へ伸びる太い線（両側）。間は口の中
        const ang = Math.atan2(x, -y)                                               // 真上が 0
        const r = Math.hypot(x, y)
        if (y < 0 && r <= L) {
          if (Math.abs(ang) < a - 0.1) c = P.bl0                                  // 口の中
          for (const sgn of [-1, 1]) {
            const d = Math.abs(ang - sgn * a) * r                                   // あごの線からの離れ（ドット）
            if (d < 2.6) c = d < 1.2 || r < 5 ? P.bl1 : P.bl0
            // 歯: あごの内側の縁に、3 ドットおき
            if (Math.abs(ang - sgn * (a - 0.13)) * r < 0.9 && r > 5 && Math.round(r) % 3 === 0) c = snap ? P.white : P.gy6
          }
        }
        if (c != null) px(cx + x, hy + y, c)
      }
      // 目（付け根の横）
      px(cx - 5 * e.dir, hy + 1, P.ye2); px(cx - 5 * e.dir, hy + 2, P.ye1)
      // 水面より下は、水の色で少し隠す（頭だけが出ている）
      for (let y = sf + 4; y < hy + 26; y++) for (let x = -14; x <= 14; x++) if ((x + y) % 2 === 0) px(cx + x, y, P.wt1)
    }
    }
    // しぶき: 口が出た瞬間に、粒が上へ散って落ちる
    if (t > 0.05) for (let i = 0; i < 14; i++) {
      const k = t - 0.05, vx = (hash(i, 401) - 0.5) * 120, vy = -80 - hash(i, 402) * 90
      const x = cx + Math.round(vx * k), y = sf + Math.round(vy * k + 260 * k * k)
      if (y <= sf + 2) px(x, y, i % 3 ? P.wt3 : P.white)
    }
    // 波紋: 水面に広がる平たい輪（長く残って消える）
    if (t > 0.2) for (let r = 0; r < 2; r++) {
      const rr = (t - 0.2 - r * 0.25) * 40
      if (rr <= 0 || rr > 36) continue
      for (let x = -rr; x <= rr; x += 2) if (Math.abs(Math.abs(x) - rr) < 6) px(cx + Math.round(x), sf, P.white)
    }
  }
  return { drawJaws, drawBlessing, drawFlowers, drawPetals, drawPuff, drawWisp, drawBloom, drawDiscover, drawCrumble, drawRevealFlash, shakeScreen, drawJet }
}
