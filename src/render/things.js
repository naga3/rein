// 道ごとの住人と物: 光の部屋の者・説く者・生き物・食べ物・町の人・供養・托鉢の僧・施す食べ物・天女と降る花・看板・誘うもの
import { P } from '../palette.js'
import { TILE, creatureAt, folkAt, offeringAt, ROCK } from '../world.js'
import { BOWL, toWorld } from '../porridge.js'
import { tr } from '../i18n.js'
import { LISTEN_RANGE, LISTEN_WAIT, RAIN_RIPEN } from '../realms.js'
import { ART } from '../art.js'
import { W, H, hash, realmOf } from './base.js'

export function makeThings({ px, addLight, text, textW, artPic, artBlit, animFrame }) {
  // 町の人の文字の一覧（絵が変わったら数え直す）
  let peopleOf = null, people = []
  const folkPeople = () => {
    const pics = ART['peta/folk']?.pics
    if (pics !== peopleOf) { peopleOf = pics; people = Object.keys(pics || {}).filter((n) => /^[a-z]1$/.test(n)).map((n) => n[0]).sort() }
    return people
  }
  // 生（seed）ごとの顔ぶれ: 置いた順に、前の人と同じにならないように選ぶ
  let facesSeed = null, faces = []
  const folkFace = (i, seed = 0) => {
    const ps = folkPeople()
    if (!ps.length) return 'a'
    if (seed !== facesSeed || faces.length <= i || faces.peopleOf !== ps) {
      facesSeed = seed; faces = []; faces.peopleOf = ps
      for (let k = 0; k <= Math.max(i, 63); k++) {
        let c = ps[Math.floor(hash(k, seed % 100003, 41) * ps.length)]
        if (ps.length > 1 && c === faces[k - 1]) c = ps[(ps.indexOf(c) + 1) % ps.length]
        faces.push(c)
      }
    }
    return faces[i]
  }
  // 光の部屋に座る地獄の者（仮。プレイヤーの絵を灰色にしたもの。座る姿などは Pixel に頼む）
  //   暗いうちは影（輪郭の色だけ）。明るくなるにつれて色が戻る。近くに来ると、こちらを向く
  const DWELLER_TONES = [
    null,
    { all: P.ink },
    { all: P.gy1 },
    { o: P.ink, w: P.gy3, b: P.gy2, B: P.gy1, e: P.gy1, O: P.gy1, G: P.gy2, Q: P.gy1, V: P.gy1, A: P.gy2 },
    { o: P.ink, w: P.gy5, b: P.gy4, B: P.gy3, e: P.gy2, O: P.gy2, G: P.gy3, Q: P.gy2, V: P.gy2, A: P.gy3 },
  ]
  const drawDweller = (room, lv, p, camX, camY) => {
    const pic = artPic('player/player', 'stand')
    if (!pic) return
    const s = room.seat, near = p && Math.abs(p.x - s.x) < 72 && Math.abs(p.y - s.y) < 48
    const faceLeft = near ? p.x < s.x : s.x > (room.x + room.w / 2) * TILE   // ふだんは部屋の奥（壁）の方を向いている
    const tone = DWELLER_TONES[Math.max(1, lv)]
    const x = Math.round(s.x - camX - 8), y = Math.round(s.y - camY - 16)
    if (tone.all != null) artBlit(pic, x, y, faceLeft, null, tone.all)
    else artBlit(pic, x, y, faceLeft, tone)
  }


  // 畜生の道の、法を説く者（比丘。地図の奥の一か所だけブッダ）。Pixel の絵（animal/monk・animal/buddha）
  //   説く声は、まわりからゆっくり昇る波紋の記号で見せる。ages: null ならいつもの 5 本、配列なら波紋ごとの生まれてからの秒数（空なら出さない）
  const drawSpeaker = (room, camX, camY, t, ages, dir = -1) => {
    const s = room.seat, x = Math.round(s.x - camX), y = Math.round(s.y - camY)
    if (room.buddha) {
      const pic = artPic('animal/buddha', 'sit')
      // まわりの光輪（市松の淡い輪）は 2026-11-06 にやめた（邪魔に見えた）
      if (pic) artBlit(pic, x - (pic.rows[0].length >> 1), y - pic.rows.length, false)
    } else {
      const pic = artPic('animal/monk', 'sit1')   // 動きは無し（2026-11-06 に唱える動き chant をやめた）
      if (pic) artBlit(pic, x - 8, y - 16, dir < 0)   // カエルの方を向く
    }
    // 声: カエルの方へ進みながら広がる弧（動きはいつも同じ。1 本は 1 周 5 秒。1 秒ごとに生まれる 5 本が等間隔に並ぶ）
    //   1 ドットのつながった弧。真ん中が白く、両端へ金色、先は細く消える。生まれた瞬間は小さく強く光り、昇るにつれて両端から欠けて、真ん中が最後に消える
    //   まわりに小さな光の粒がまたたきながら昇る
    const us = ages ? ages.map((a) => (a * 0.2) % 1) : [0, 1, 2, 3, 4].map((k) => (t * 0.2 + k / 5) % 1)
    // 声はカエルの方へ（dir: 1 右、-1 左）。口もとから横へ、少しずつ昇りながら進む
    const ox = x + dir * (room.buddha ? 7 : 5), oy = y - (room.buddha ? 15 : 10)
    us.forEach((u, n) => {
      const r = 3 + u * 9, cx = ox + dir * u * 34, cy = oy - u * 5, half = 1.15 - u * 0.25   // 弧の半分の開き（ラジアン）
      const keep = u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45                  // 昇るにつれ、両端から欠ける
      let last = null
      for (let a = -half; a <= half; a += 0.02) {
        const X = Math.round(cx + dir * Math.cos(a) * r * 0.62), Y = Math.round(cy + Math.sin(a) * r)
        if (last && last[0] === X && last[1] === Y) continue
        last = [X, Y]
        const e = Math.abs(a) / half                                       // 0 真ん中、1 端
        if (e > keep) continue
        const c = u < 0.08 ? P.white : e < 0.35 ? (u < 0.5 ? P.white : P.ye3) : e < 0.75 ? P.ye3 : u < 0.5 ? P.ye2 : P.ye1   // 先ほど濃い金色
        px(X, Y, c)
      }
      // 生まれた瞬間: 真ん中に小さな光
      if (u < 0.08) { px(ox, oy, P.white); px(ox, oy - 1, P.ye3); px(ox, oy + 1, P.ye3) }
      // 光の粒: 弧のまわりで生まれ、ゆっくり昇り、またたいて消える
      for (let k = 0; k < 2; k++) {
        const h = hash(n, k, 40), su = (u * 1.7 + k * 0.5) % 1
        const sx = Math.round(ox + dir * su * 36), sy = Math.round(oy + (h - 0.5) * 20 - su * 6)
        if (su > 0.75 && Math.floor(t * 12 + k) % 2) continue
        px(sx, sy, su < 0.4 ? P.white : P.ye3)
      }
    })
  }


  // 生き物（world.js の creatureAt）。Pixel の絵（animal/bird・fish・snake）
  const drawCreature = (c, camX, camY, time) => {
    const s = creatureAt(c, time), x = Math.round(s.x - camX), y = Math.round(s.y - camY)
    if (x < -20 || x > W + 20 || y < -30 || y > H + 30) return
    if (c.kind === 'fish' && !s.show) {
      // 跳ねる前の予兆: 水面に波紋
      if (s.warn) { const sy = c.ty * TILE - camY + 5; for (let i = -6; i <= 6; i += 2) if ((i + Math.floor(time * 12)) % 4 === 0) px(x + i, sy, P.white) }
      return
    }
    const pic = artPic(`animal/${c.kind}`, s.frame)
    const shake = s.warn ? (Math.floor(time * 30) % 2 ? 1 : -1) : 0   // 動き出す前は小刻みに震える
    // 蛇は絵の下の端を床にそろえる（s.y は床より 3 ドット上の、当たりの真ん中。y - 8 では 5 ドット埋まっていた）
    const top = c.kind === 'snake' ? y + 3 - 16 : y - 8
    if (pic) artBlit(pic, x - 8 + shake, top, (s.dir ?? 1) < 0)
  }


  // 食べ物（地図の O）: 山盛りで、つやつや。触ると（S.rotten）腐って崩れ、消える
  let pilesOf = null, piles = []
  const foodPiles = () => { const pics = ART['peta/food']?.pics; if (pics !== pilesOf) { pilesOf = pics; piles = Object.keys(pics || {}).filter((n) => /^pile/.test(n)).sort() } return piles }
  const drawFood = (f, camX, camY, S) => {
    const x = f.tx * TILE - camX, y = f.ty * TILE - camY
    if (x < -16 || x > W || y < -16 || y > H) return
    // 食べ物の種類: peta/food の pile で始まる絵を全部使い、置いた場所で選ぶ（2026-11-07。前は pile1〜4 の決め打ち。Pixel で増やせばそのまま増える）
    const piles = foodPiles(), rotAt = S.rotten?.get(f.index)
    let name = piles.length ? piles[Math.floor(hash(f.tx, f.ty, 33) * piles.length)] : 'pile1'
    if (rotAt != null) { if (S.time - rotAt > 0.9) return; name = 'rot' }   // 触ると腐る: rot（2026-11-09 に rot2 から名前を変えた）
    const pic = artPic('peta/food', name)
    if (pic) artBlit(pic, x, y + 16 - pic.rows.length, false)
  }
  // 町の人（地図の M）。餓鬼より大きく、餓鬼の方は見ない
  //   look: 人の道では、近くにいるプレイヤーの方を向く（餓鬼の道では、誰も気づかない）
  const drawFolk = (f, camX, camY, time, look, seed) => {
    const s = { ...folkAt(f, time) }, x = Math.round(s.x - camX), y = Math.round(s.y - camY)
    if (look) { s.dir = look.x < s.x ? -1 : 1; s.frame = 0 }   // こちらを見ている（立ち止まる。game.js の stepFolk）
    if (x < -12 || x > W + 12 || y < 0 || y > H + 30) return
    // 町の人の顔ぶれ: peta/folk にいる人（a1・b1 … の 1 コマ目がある文字）を全部使い、生ごとにばらばらに選ぶ（seed は S.folkSeed。2026-11-07）
    const letter = folkFace(f.index, seed), pic = artPic('peta/folk', `${letter}${s.frame + 1}`)
    if (pic) artBlit(pic, x - 8, y - pic.rows.length, s.dir < 0)
  }
  // 供養の人（またはサーリプッタ）と、置かれた供養の食べ物。置くときに言葉を出す
  const drawOffering = (room, camX, camY, S) => {
    const st = offeringAt(room, S.time), seatX = Math.round(room.seat.x - camX), seatY = Math.round(room.seat.y - camY)
    if (st.food && !S.found?.has(room.index)) {
      const pic = artPic('peta/food', 'offering')
      // ほのかな光（市松）
      for (let j = -12; j <= 2; j++) for (let i = -10; i <= 10; i++) if ((i * i) / 100 + ((j + 4) * (j + 4)) / 64 < 1 && (i + j + Math.floor(S.time * 6)) % 2 === 0 && (i * i) / 100 + ((j + 4) * (j + 4)) / 64 > 0.45) px(seatX + i, seatY + j, P.ye3)
      if (pic) artBlit(pic, seatX - 8, seatY - pic.rows.length, false)
    }
    if (!st.show) return
    const x = Math.round(st.x - camX), y = Math.round(st.y - camY), ref = room.sariputta ? 'peta/sariputta' : 'peta/offerer'
    const pic = artPic(ref, st.kneel ? 'kneel' : `walk${(st.frame ?? 0) + 1}`)
    if (pic) artBlit(pic, x - 8, y - pic.rows.length, st.dir < 0)
    // 言葉は絵の頭の上 16 ドットに（2026-11-07 に絵が 16×16 になったので、高さから決める。前は 24 の高さの決め打ちで y - 40）
    if (st.wish) { const msg = room.sariputta ? tr.sariputtaWish : tr.offerWish; text(Math.max(2, Math.min(W - textW(msg) - 2, x - (textW(msg) >> 1))), y - (pic?.rows.length ?? 24) - 16, msg, P.white, P.ink) }
  }


  // 施す食べ物: 器に入った乳粥（2026-11-08 に全部乳粥にした。粒は src/porridge.js）。
  //   器は Pixel の human/gift の bowl（空の器。32 × 32、下の端が足、内側は透明）と full（置いてある、盛った器）。無ければコードで描く仮の器
  //   器の座標: 内側の底の真ん中が (0, 0)、上が負。絵では (16, 28)
  const BOWL_C = { line: P.br1, body: P.br4, shade: P.br3, rim: P.br5 }
  const inBowl = (lx, ly) => {   // 仮の器の、その点の色（無ければ null）。内側は粒の壁と同じ台形、外は丸い底の素焼き（壁の厚さ 3）
    const { bottom, rim, depth } = BOWL, ax = Math.abs(lx)
    if (ly < -depth - 0.5 || ly > 4.5) return null
    const k = Math.min(1, Math.max(0, -ly / depth)), inner = bottom + (rim - bottom) * k
    if (ly > 3.5) return ax <= 5 ? BOWL_C.line : null   // 足
    const outer = ly <= 0 ? inner + 3 : bottom + 3 - ly * ly * 0.9   // 底は丸く
    if (ax > outer) return null
    if (ly <= 0.5 && ax <= inner) return null   // 内側（粒が見える）
    if (ax > outer - 1 || ly > 2.5) return BOWL_C.line
    if (ly < -depth + 0.5) return BOWL_C.rim
    return ly > -2 || ax > outer - 1.8 ? BOWL_C.shade : BOWL_C.body
  }
  // 器を描く（x, y は内側の底の真ん中の画面の座標、a は傾き。ラジアン）
  const drawBowl = (x, y, a = 0) => {
    const pic = artPic('human/gift', 'bowl'), co = Math.cos(a), si = Math.sin(a)
    for (let j = -20; j <= 8; j++) for (let i = -18; i <= 18; i++) {
      const lx = i * co + j * si, ly = -i * si + j * co   // 画面の点を器の座標へ
      let c = null
      if (pic) { const ch = pic.rows[Math.round(ly) + 28]?.[Math.round(lx) + 16]; if (ch && ch !== '.') c = pic.colors[ch] }
      else c = inBowl(lx, ly)
      if (c != null) px(x + i, y + j, c)
    }
  }
  // 置いてある、盛った器（x, y は足もとの真ん中）
  // appear: 現れる途中（0〜1。点ごとにぽつぽつ）、steam: 現れてからの秒（湯気。null なら無し）
  const drawGift = (index, x, y, appear = 1, steam = null) => {
    if (steam != null) for (let i = 0; i < 3; i++) {   // 湯気: 細い白い点が 3 本、揺れながら昇って消える
      const k = (steam * 0.9 + i * 0.3) % 1, sx = x - 5 + i * 5 + Math.round(Math.sin(steam * 5 + i * 2) * 1.5), sy = y - 14 - Math.round(k * 12)
      if (k < 0.8 && steam < 1.4) px(sx, sy, k < 0.4 ? P.white : P.gy6)
    }
    const full = artPic('human/gift', 'full')
    if (appear < 1) {   // ぽつぽつ現れる
      const keep = px
      px = (X, Y, c) => { if (hash(X - x, Y - y, 17) < appear) keep(X, Y, c) }
      try { drawGiftBody(index, x, y, full) } finally { px = keep }
      return
    }
    drawGiftBody(index, x, y, full)
  }
  const drawGiftBody = (index, x, y, full) => {
    if (full) { full.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') px(x - 16 + i, y - full.rows.length + j, full.colors[ch]) })); return }
    const by = y - 4, { bottom, rim, depth } = BOWL
    for (let j = -depth - 3; j <= 0; j++) {
      const hw = j < -depth ? Math.sqrt(Math.max(0, 1 - ((j + depth) / 3.5) ** 2)) * rim * 0.9 : bottom + (rim - bottom) * (-j / depth)
      for (let i = -Math.floor(hw); i <= Math.floor(hw); i++) {
        const top = j === -depth - 3 || (j < -depth && Math.abs(i) >= Math.floor(hw) - 1)
        px(x + i, by + j, hash(i + index * 7, j, 3) < 0.1 ? P.white : top ? P.bg1 : j > -3 ? P.sa2 : P.sa3)
      }
    }
    drawBowl(x, by, 0)
  }
  // 乳粥の粒を、ひとつながりのとろみとして描く（2026-11-08）: 画面の点ごとに、いちばん近い粒まで PORRIDGE_R ドット以内なら塗る（粒の間に隙間が空かない）。
  //   上が空いている点（表面）は明るく、その下は生成り、深い所は少し暗い。米粒（grain）の真ん中に白い点。消え際（こぼれて 1 秒過ぎ）は、粒ごとに 1 ドットでまたたく
  const PORRIDGE_R = 2.3
  const drawPorridge = (Pq, camX, camY) => drawBlob(Pq.ps.map((p) => { const [wx, wy] = Pq.free ? [p.x, p.y] : toWorld(Pq.pose, p.x, p.y); return { x: wx, y: wy, grain: p.grain, life: p.life } }), camX, camY)   // 運ぶ間は器の座標
  // 縁からこぼれた粒（運ぶ間。src/porridge.js の drops）: 全部こぼしたときと同じ描き方（落ちて床にとどまり、またたいて消える）
  const drawDrops = (Pq, camX, camY) => { if (Pq?.drops?.length) drawBlob(Pq.drops, camX, camY) }
  const drawBlob = (list, camX, camY) => {
    const pts = []
    for (const [k, p] of list.entries()) {
      if (p.life > 1.6) continue
      const x = p.x - camX, y = p.y - camY
      if (p.life > 1.0) { if ((k + Math.floor(p.life * 20)) % 2) px(Math.round(x), Math.round(y), p.grain ? P.white : P.sa3); continue }
      pts.push({ x, y, grain: p.grain })
    }
    if (!pts.length) return
    const x0 = Math.floor(Math.min(...pts.map((q) => q.x)) - 3), x1 = Math.ceil(Math.max(...pts.map((q) => q.x)) + 3)
    const y0 = Math.floor(Math.min(...pts.map((q) => q.y)) - 3), y1 = Math.ceil(Math.max(...pts.map((q) => q.y)) + 3)
    const w = x1 - x0 + 1, h = y1 - y0 + 1, fill = new Uint8Array(w * h), R2 = PORRIDGE_R * PORRIDGE_R
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const X = x0 + i + 0.5, Y = y0 + j + 0.5
      for (const q of pts) { const dx = X - q.x, dy = Y - q.y; if (dx * dx + dy * dy < R2) { fill[j * w + i] = 1; break } }
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!fill[j * w + i]) continue
      const up1 = j > 0 && fill[(j - 1) * w + i], up3 = j > 2 && fill[(j - 3) * w + i]
      px(x0 + i, y0 + j, !up1 ? P.bg1 : !up3 ? P.sa3 : P.sa2)
    }
    for (const q of pts) if (q.grain) px(Math.round(q.x), Math.round(q.y), P.white)
  }
  // 運んでいる器と、中の乳粥（S.porridge。drawBlob でひとつながりに描く）。傾きが shake を越えると、かたかた震える
  const drawCarried = (S, camX, camY, shake = 1) => {
    const Pq = S.porridge
    if (!Pq || Pq.free) return
    const jit = Math.abs(S.tilt || 0) > shake ? (Math.floor(S.time * 30) % 2 ? 1 : 0) : 0
    drawPorridge(Pq, camX, camY - jit)
    drawBowl(Math.round(Pq.pose.x - camX), Math.round(Pq.pose.y - camY) + jit, Pq.pose.a)
  }
  // 人の道の転がる岩（2026-11-08。動きは game.js の stepRocks）。Pixel の human/rock の rock（16 × 16）があれば回して描く。無ければコードで丸い岩
  //   出る前（warn 秒）: 出る所の足もとから砂ぼこりが立ちはじめ、だんだん増える。出る瞬間は砂ぼこりがぱっと舞い、その中から現れる（2026-11-10）。転がる: 回り、後ろに小さな土ぼこり。落ちて着くと大きな土ぼこり（2026-11-10）。壁で砕ける: 破片が飛び、土ぼこりが残る。川: しぶきを上げて沈む
  const ROCK_C = { line: P.st1, body: P.st2, light: P.gy4, dark: P.gy2 }
  const drawRockBody = (cx, cy, a, clipY = Infinity) => {
    const pic = artPic('human/rock', 'rock'), co = Math.cos(a), si = Math.sin(a)
    for (let j = -8; j < 8; j++) for (let i = -8; i < 8; i++) {
      const x = i + 0.5, y = j + 0.5, d = Math.hypot(x, y)
      if (cy + j >= clipY) continue
      const lx = x * co + y * si, ly = -x * si + y * co   // 岩の模様の座標（回る）
      let c = null
      if (pic) { const ch = pic.rows[Math.floor(ly + 8)]?.[Math.floor(lx + 8)]; if (ch && ch !== '.') c = pic.colors[ch] }
      else if (d < 7.6) {
        const lit = -(x + y) / 10.7   // 左上から光
        c = d > 6.6 ? ROCK_C.line : lit > 0.35 ? ROCK_C.light : lit < -0.35 ? ROCK_C.dark : ROCK_C.body
        if (d <= 6.6 && hash(Math.floor(lx / 2.5) + 9, Math.floor(ly / 2.5) + 9, 91) < 0.18) c = ROCK_C.dark   // 回る模様（くぼみ）
      }
      if (c != null) px(cx + i, cy + j, c)
    }
  }
  const drawRocks = (S, world, camX, camY, t) => {
    // 土ぼこり（S.rockDust。game.js の stepRocks）: 大きいもの（落ちて着いたとき）は初め 2 × 2、小さいもの（転がる間）は 1 ドット。淡い砂色から灰へ、消え際はまたたく
    for (const [n, d] of (S.rockDust || []).entries()) {
      const k = d.t / d.life, x = Math.round(d.x - camX), y = Math.round(d.y - camY)
      if (k > 0.6 && (n + Math.floor(d.t * 20)) % 2) continue
      const c = d.big ? (k < 0.15 ? P.white : k < 0.45 ? P.gy6 : k < 0.7 ? P.sa2 : P.gy5) : (k < 0.3 ? P.sa3 : k < 0.65 ? P.sa2 : P.gy5)   // 大きいものは白く立ってから砂色へ
      px(x, y, c)
      if (d.big && k < 0.6) { px(x + 1, y, c); px(x, y - 1, c); px(x + 1, y - 1, c) }
    }
    const R = ROCK.r
    for (const r of S.rocks || []) {
      const cx = Math.round(r.x - camX), cy = Math.round(r.y - camY) - R
      if (cx < -20 || cx > W + 20) continue
      if (r.st === 'roll') {
        if (r.t < 0.15) { const keep = px, k = r.t / 0.15; px = (X, Y, c) => { if (hash(X - cx, Y - cy, 29) < k) keep(X, Y, c) }; try { drawRockBody(cx, cy, r.a) } finally { px = keep } }   // 出たばかり: 砂ぼこりの中から、ぽつぽつ現れる
        else drawRockBody(cx, cy, r.a)
      } else if (r.st === 'break') {
        // 破片: 白いひと打ちのあと、ばらばらに飛んで落ちる。土ぼこりはゆっくり残る
        if (r.t < 0.05) for (let j = -6; j < 6; j++) for (let i = -6; i < 6; i++) if (Math.hypot(i + 0.5, j + 0.5) < 6.5) px(cx + i, cy + j, P.white)
        for (let i = 0; i < 9; i++) {
          const life = 0.45 + hash(r.seed, i, 94) * 0.5
          if (r.t > life) continue
          const vx = -r.dir * (20 + hash(r.seed, i, 95) * 60) + (hash(r.seed, i, 96) - 0.5) * 50, vy = -60 - hash(r.seed, i, 97) * 90
          const x = cx + Math.round(vx * r.t), y = cy + Math.round(vy * r.t + 300 * r.t * r.t)
          const c = i % 3 ? ROCK_C.body : ROCK_C.light
          px(x, y, c); if (i < 5 && r.t < life * 0.6) { px(x + 1, y, c); px(x, y + 1, ROCK_C.line) }
        }
        for (let i = 0; i < 6; i++) { const k = Math.min(1, r.t / 1.0), x = cx + Math.round((hash(r.seed, i, 98) - 0.5) * 14 * (0.5 + k)), y = cy + R - 2 - Math.round(k * 5 * hash(r.seed, i, 99)); if (r.t < 0.9 && (i + Math.floor(r.t * 12)) % 3) px(x, y, P.gy5) }
      } else if (r.st === 'sink') {
        const sy = Math.round(r.sy - camY)
        drawRockBody(cx, cy + Math.round(Math.min(1, r.t / 0.6) * 18), r.a, sy)
        for (let i = 0; i < 8; i++) { const life = 0.3 + hash(r.seed, i, 101) * 0.4; if (r.t > life) continue; const vx = (hash(r.seed, i, 102) - 0.5) * 70, vy = -50 - hash(r.seed, i, 103) * 60; px(cx + Math.round(vx * r.t), sy + Math.round(vy * r.t + 260 * r.t * r.t), i % 2 ? P.white : P.bl5) }
      }
    }
  }
  // 托鉢の僧（Pixel の human/monk、奥の一か所だけ human/buddha）。食べ物を受け取ると、祝福の偈を唱える（しばらく言葉を出す）
  const drawMonk = (room, camX, camY, S, p) => {
    const s = room.seat, x = Math.round(s.x - camX), y = Math.round(s.y - camY), got = S.found?.has(room.index)
    const dir = p ? (p.x < s.x ? -1 : 1) : -1
    // ブッダのまわりの光輪は 2026-11-10 にやめた（畜生の道のブッダと同じく、光輪なし）
    const pic = artPic(room.buddha ? 'human/buddha' : 'human/monk', got ? 'bless' : 'stand')
    if (pic) artBlit(pic, x - (pic.rows[0].length >> 1), y - pic.rows.length, dir < 0)   // 絵の幅の真ん中を座る所に
    if (S.alms?.room === room.index && S.alms.t > 0.6 && S.alms.t < 4) { const msg = tr.blessing; text(Math.max(2, Math.min(W - textW(msg) - 2, x - (textW(msg) >> 1))), y - 40, msg, P.white, P.ink) }
  }


  // 花を拾った瞬間の「キラン」: 白い閃光（2 コマ）→ 十字の光の筋がすっと伸びて縮む → 花の色の粒が舞い上がって、またたいて消える
  const drawSparkle = (k, camX, camY) => {
    const x = Math.round(k.x - camX), y = Math.round(k.y - camY), t = k.t, [c, d] = BLOOM_SPARK[k.color]
    if (t < 0.035) for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (i * i + j * j <= 5) px(x + i, y + j, P.white)
    if (t < 0.28) {
      const u = t / 0.28, len = Math.round(2 + 9 * Math.sin(u * Math.PI)), dlen = u < 0.5 ? 2 : 0   // 斜めは短く、出だしだけ
      for (let i = 1; i <= len; i++) { const cc = i < len * 0.5 ? P.white : P.ye3; px(x + i, y, cc); px(x - i, y, cc); px(x, y + i, cc); px(x, y - i, cc) }
      for (let i = 1; i <= dlen; i++) { px(x + i, y + i, c); px(x - i, y + i, c); px(x + i, y - i, c); px(x - i, y - i, c) }
      px(x, y, P.white)
    }
    for (let n = 0; n < 5; n++) {
      const a = (n / 5) * 6.28 + k.seed, w = t / 0.6
      if (w > 0.7 && Math.floor(t * 30 + n) % 2) continue
      const r = 4 + w * 10 * (0.6 + hash(n, k.seed, 95) * 0.6)
      px(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.6 - w * 10), n % 2 ? c : d)
    }
  }
  // 天女（上空を舞いながら花をまく。Pixel の deva/apsara）と、降ってくる花（Pixel の deva/flowers）
  // 花の色の名前（deva/flowers の絵の名前）と、拾ったときのキランの色（明るい・暗い）
  const BLOOM_COLORS = ['red', 'white', 'blue', 'yellow', 'pink'], BLOOM_SPARK = [[P.rd3, P.rd2], [P.white, P.gy5], [P.bl4, P.bl3], [P.ye2, P.ye1], [P.pk3, P.pk2]]
  const drawRain = (S, camX, camY, t) => {
    const a = S.apsara?.(S.rain.t), ax = a && Math.round(a.x - camX), ay = a && Math.round(a.y - camY)
    if (a && !(S.rain.dropped >= 100 && !S.rain.items.length)) {
      const pic = artPic('deva/apsara', 'fly1')   // 天女は動かさず、fly1 の一枚だけ（2026-11-10。本人の頼み）
      if (pic) artBlit(pic, ax - (pic.rows[0].length >> 1), ay - (pic.rows.length >> 1), a.dir < 0)
    }
    for (const k of S.rain.sparks) drawSparkle(k, camX, camY)
    for (const f of S.rain.items) {
      if (f.t < RAIN_RIPEN && Math.floor(f.t * 16) % 2) continue   // まかれたばかりの花は点滅（まだ拾えない）
      const x = Math.round(f.x - camX), y = Math.round(f.y - camY), pic = artPic('deva/flowers', BLOOM_COLORS[f.color])
      if (pic) artBlit(pic, x - (pic.rows[0].length >> 1), y - (pic.rows.length >> 1) - 4, false)   // 絵の幅の真ん中を花の位置に（2026-11-10。大きくしても、ずれないように）
    }
  }

  // 看板（地図の B。Pixel の sign/sign。16 × 16。どの道でも同じ一枚: 法はどの道でも同じなので）。前に立つと、上に「↓」が浮かぶ（下キーで読める合図）
  // 読んだ看板の花（2026-11-06）: 看板の柱の根もとの右に、小さな白いカーネーション（死の花〈赤・高さ 14〉と見分けるため、白と淡い桃・高さ 8）。
  //   芯がごく淡く光る。初めて読んで窓を閉じた瞬間に、つぼみから開く（S.signBloom）。絵は Pixel の sign/flower（bud・half・bloom）
  //   咲いたあとは sway（風にそよぐ。看板ごとに少しずらす）
  const drawSignFlower = (x, y, k, t = 0, seed = 0) => {
    if (!ART['sign/flower']) return
    const name = k < 0.34 ? 'bud' : k < 0.67 ? 'half' : (k >= 1 && animFrame('sign/flower', 'sway', t + seed * 0.71)) || 'bloom'
    const pic = artPic('sign/flower', name) || artPic('sign/flower', 'bloom')
    if (pic) { artBlit(pic, x - (pic.rows[0].length >> 1), y - pic.rows.length, false); if (k >= 0.67) addLight(x, y - pic.rows.length + 2, P.white, 0.18) }
  }
  const drawSign = (g, camX, camY, S, t) => {
    const x = Math.round(g.x - camX), y = Math.round(g.y - camY)
    if (x < -20 || x > W + 20 || y < -40 || y > H + 20) return
    const pic = artPic('sign/sign', 'sign')
    if (pic) artBlit(pic, x - (pic.rows[0].length >> 1), y - pic.rows.length, false)
    // 読んだ看板の花（看板の手前に）（初めて読んでいる間は、まだ咲かない）
    if (g.id && S.signsRead?.has(g.id) && !(S.reading?.first && S.reading.id === g.id)) {
      const b = S.signBloom?.id === g.id ? S.signBloom.t : null
      drawSignFlower(x + 6, y, b == null ? 1 : Math.min(1, b / 0.6), t, g.index ?? 0)
    }
    // 読める合図: 下向きの小さな矢印が、ふわりと上下する（下キーで読む）（読んだことのある看板は、少し暗く）
    if (S.signNear && S.signNear.index === g.index && (S.signNearOff || 0) === (g.off || 0) && !S.reading && !S.dead) {   // 写し（g.off）は、その写しの前に立ったときだけ
      const ay = y - 26 + Math.round(Math.sin(t * 5) * 1.5), seen = S.signsRead?.has(g.id)
      const c = seen ? P.gy5 : P.white
      const ARROW = ['..#..', '..#..', '#.#.#', '.###.', '..#..']   // 下向き（下で読む）
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (ARROW[j][i] === '#') for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) px(x - 2 + i + dx, ay + j + dy, P.black)
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (ARROW[j][i] === '#') px(x - 2 + i, ay + j, c)
    }
  }

  // 再び人の誘うもの（Pixel の last/tempt）。ゆらゆら浮かび、きらめく。その周で触れたものは消えている
  const TEMPT_NAMES = ['feast', 'flower', 'jewel', 'sweet', 'crown']
  const TEMPT_FADE = 1.6, TEMPT_STAGGER = 0.5   // 輪が切れたときの消え方（秒）: 一つの消える長さ、一つずつのずれ
  const drawTempts = (world, S, camX, camY, t) => {
    const lp = world.loop, L = S.loopRun
    for (const tm of world.tempts) for (const o of !lp ? [0] : [0, ...(tm.x >= lp.x0 && tm.x < lp.x0 + 20 * TILE ? [lp.len] : []), ...(tm.x >= lp.x0 + lp.len - 20 * TILE && tm.x < lp.x0 + lp.len ? [-lp.len] : [])]) {
      // 触れたものは、その周の間は消えている。ただし継ぎ目の先の写し（o > 0）は次の周の景色なので、
      //   触れたものも並べておく（継ぎ目を越えた瞬間に突然現れないように）
      if (!L.freed && o <= 0 && L.taken.has(tm.index)) continue
      // 輪が切れたら（渇愛が消えた）、誘うものは一つずつ少しずれて、ふわりと昇りながら色を失い、ドットがばらばらに抜けて消える
      let k = 0
      if (L.freed) { k = ((L.freedT ?? 99) - hash(tm.index, 3, 5) * TEMPT_STAGGER) / TEMPT_FADE; if (k >= 1) continue; k = Math.max(0, k) }
      const x = Math.round(tm.x + o - camX), y = Math.round(tm.y - camY + Math.sin(t * 2 + tm.index) * 2 - 2 - k * k * 10)
      if (x < -16 || x > W + 16 || y < -24 || y > H + 16) continue
      const gone = k ** 1.4, pale = Math.max(0, k * 1.6 - 0.2)
      const tp = (xx, yy, c) => {
        if (k > 0) {
          if (hash(xx - x + 40, yy - y + 40, tm.index * 7 + 1) < gone) return
          if (hash(xx - x + 40, yy - y + 40, tm.index * 7 + 2) < pale) c = hash(xx - x, yy - y, tm.index) < 0.5 ? P.gy5 : P.white
        }
        px(xx, yy, c)
      }
      if (k > 0) for (let n = 0; n < 4; n++) {   // 抜けたドットが、小さな光の粒になって昇る
        const u = Math.min(1, k * 1.3 + hash(tm.index, n, 9) * 0.2)
        if (u < 1 && Math.floor(t * 12 + n) % 3) px(Math.round(x + (hash(tm.index, n, 11) - 0.5) * 14 + Math.sin(t * 3 + n) * 2), Math.round(y - 6 - u * (14 + hash(tm.index, n, 13) * 14)), n % 2 ? P.ye3 : P.white)
      }
      const pic = artPic('last/tempt', TEMPT_NAMES[tm.kind])
      if (pic) pic.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') tp(x - 8 + i, y - pic.rows.length + j, pic.colors[ch]) }))
      if ((Math.floor(t * 4) + tm.index) % 5 === 0) { tp(x + 5, y - 10, P.white); tp(x + 4, y - 10, P.ye3); tp(x + 5, y - 11, P.ye3) }   // きらめき
    }
    // 味わった瞬間: 小さな光と、うっとりした言葉がふわりと昇る
    for (const s of S.savors || []) {
      const x = Math.round(s.x - camX), y = Math.round(s.y - camY - s.t * 14)
      for (let n = 0; n < 6; n++) { const a = n / 6 * 6.28 + s.t * 2, r = 4 + s.t * 10; if (s.t < 0.9 || Math.floor(s.t * 20 + n) % 2) px(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.6), n % 2 ? P.pk3 : P.ye3) }
      if (s.t < 1.1) text(x - (textW(s.text) >> 1), y - 20, s.text, P.pk3, P.ink)
    }
  }

  // 光の部屋の者（lightLv: 光の段 0〜4）。地獄は座る者、畜生は説く者
  const drawSeat = (S, p, lightLv, camX, camY, t) => {
    const world = S.world
    // 光の部屋の地獄の者
    if (S.room?.light && S.room.seat) {
      if (realmOf(world).light === 'approach') drawDweller(S.room, lightLv, p, camX, camY)
      else if (realmOf(world).light === 'listen') {
        // 声の波紋: 説く者のそばに入ると 1 本出て、じっと待つ 1 秒ごとに 1 本ずつ増える（待ち終えると光り始める）。聞き終えた所では、いつも 5 本
        const found = S.found?.has(S.room.index), near = p && !S.dead && !!S.hearing   // そばで、説く者のほうを向いて立っているときだけ（game.js の S.hearing）
        // 波紋 k 本目の年: 1 本目はそばに入ってから、2 本目からは待ち始めて k 秒たってから（どれも小さな弧から生まれる）
        const ages = found ? null : near ? [S.nearT ?? 0, ...Array.from({ length: Math.min(LISTEN_WAIT, 1 + Math.floor(S.listen ?? 0)) - 1 }, (_, k) => (S.listen ?? 0) - (k + 1))] : []
        const face = p ? (p.x < S.room.seat.x ? -1 : 1) : -1
        drawSpeaker(S.room, camX, camY, t, ages, face)
      }
    }
  }

  return { drawSeat, drawOffering, drawCreature, drawSign, drawFood, drawFolk, drawRain, drawGift, drawCarried, drawPorridge, drawDrops, drawBowl, drawRocks, drawMonk, drawTempts }
}
