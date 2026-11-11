// 餓鬼の道の背景（2026-11-07。コードで描く。これを見て Pixel に頼むかを決める）
//   部屋の scene で描き分ける（無ければ左隣の部屋のものを引き継ぐ。いちばん左は town）。画面の縦の列ごとに、その列の部屋の背景を選ぶ
//   （部屋の境目で背景が切り替わる）。どれも、空の帯 → 遠くの家並み（ゆっくり流れる）→ 近くの家並みと飾り（少し速く流れる）→ 漂うもの、の順に描く
//   town  賑わう町: 昼の青空。屋根の形も高さもばらばらの家並み、軒の日よけ、張り渡した色とりどりの旗、吊るした灯り、台所の煙
//   river 水辺: 向こう岸の低い家並み、きらめく川面、行き来する舟、手前の葦
//   wind  熱い風: 黄土色にかすむ空、陽炎で揺れる家並み、右へ吹き流れる砂ぼこり
//   dusk  夕方: 紫から橙の空、影になった家並みに灯る窓と灯り
//   night 夜: 暗い空に星、黒い家並みに灯る窓と灯り
//   dawn  夜明け: 淡い桃と黄の空、やわらかな家並み（サーリプッタの光の部屋の前）
import { P } from '../palette.js'
import { ART } from '../art.js'
import { TILE } from '../world.js'
import { W, H, hash } from './base.js'
import { makeHaze } from './haze.js'

const SCENES = {
  town: { bands: [[0, P.bl4], [100, P.bl5], [165, P.gy6]], far: [P.gy5, P.gy6, P.bl5], near: [P.sa2, P.sk3, P.br5, P.lv2, P.sg1], roof: [P.rd1, P.br2, P.tl1, P.rd2], win: P.gy3, lit: false },
  river: { bands: [[0, P.bl4], [110, P.bl5], [150, P.bl5]], far: [P.gy5, P.gy6, P.bl5], near: [P.sa2, P.sk3, P.br5], roof: [P.br2, P.rd1], win: P.gy3, lit: false },
  wind: { bands: [[0, P.sa1], [90, P.sa2], [160, P.sk3]], far: [P.br4, P.sa1, P.br5], near: [P.br4, P.sk2, P.br5], roof: [P.br2, P.br1], win: P.br2, lit: false },
  dusk: { bands: [[0, P.pu1], [70, P.pk1], [130, P.or1], [175, P.pk2]], far: [P.pu1, P.pu0, P.ye1], near: [P.pu0, P.ink, P.gy1], roof: [P.ink, P.pu0], win: P.ye2, lit: true },
  night: { bands: [[0, P.black], [90, P.bl0], [170, P.pu0]], far: [P.gy1, P.ink, P.ye1], near: [P.ink, P.black, P.gy1], roof: [P.black, P.ink], win: P.ye2, lit: true },
  dawn: { bands: [[0, P.pu3], [80, P.pk3], [150, P.ye3]], far: [P.lv2, P.lv1, P.ye3], near: [P.pl2, P.lv2, P.sk3], roof: [P.pk2, P.pu3], win: P.pl1, lit: false },
}

export function makeTownSky({ fb, px: rawPx, addLight, tint: rawTint }) {
  const haze = makeHaze(rawPx, rawTint), { px, tint } = haze   // 白いかすみは、切り貼りのあとで重ねる（src/render/haze.js）
  // Pixel の背景の層（2026-11-07）: peta/<背景の種類> の far（遠く）・near（近く）。あれば横にくり返して、決まった速さでずらして描く
  //   （無ければコードの家並み）。下の端を bottom にそろえる。透明（.）は後ろが見える。夕方・夜（lit）は、文字 g の所を灯りとして光らせる。
  //   shake: 陽炎（行ごとに横へ揺らす）
  const NEAR_HAZE = 0.4
  // haze: 白をうっすら重ねる割合（近くの層がごちゃごちゃして見えたので、全体を淡くする。2026-11-07。本当の半透明の層。あとから描く床・人には重ならない）
  const layer = (name, which, camX, t, par, bottom, lit, shake = 0, haze = 0) => {
    const a = ART[`peta/${name}`], rows = a?.pics?.[which]
    if (!rows) return false
    const w = rows[0].length, h = rows.length, top = bottom - h, off = ((Math.floor(camX * par) % w) + w) % w   // 整数に丸める（小数のまま列を引くと色が取れず、スクロールの途中で黒くなった。2026-11-07）
    for (let j = 0; j < h; j++) {
      const y = top + j
      if (y < 0 || y >= H) continue
      const sx = shake ? Math.round(Math.sin(y * 0.35 + t * 5) * shake) : 0, row = rows[j]
      for (let x = 0; x < W; x++) {
        const ch = row[((x + off - sx) % w + w) % w]
        if (ch === '.' || ch == null || a.colors[ch] == null) continue   // 行が短い・知らない文字のときも描かない（黒い点にしない）
        px(x, y, a.colors[ch])
        if (haze && tint) tint(x, y, P.white, haze)
        if (lit && ch === 'g') light(x, y, P.or2, 0.14)
      }
    }
    return true
  }

  const sceneCache = new WeakMap()
  // 部屋ごとの背景（無ければ左隣の部屋のもの）
  const roomScenes = (world) => {
    const sig = world.rooms.map((r) => r.scene || '').join(',')   // 部屋の scene が変わったら（エディタ・確かめ）数え直す
    let m = sceneCache.get(world)
    if (m && m.sig === sig) return m
    m = new Map(); m.sig = sig
    const rooms = world.rooms.slice().sort((a, b) => a.x - b.x || a.y - b.y)
    for (const r of rooms) {
      let sc = r.scene
      if (!sc) { const left = rooms.filter((q) => q.x + q.w <= r.x && m.get(q.index)).sort((a, b) => b.x + b.w - (a.x + a.w) || Math.abs(a.y - r.y) - Math.abs(b.y - r.y))[0]; sc = left ? m.get(left.index) : 'town' }
      m.set(r.index, SCENES[sc] ? sc : 'town')
    }
    sceneCache.set(world, m)
    return m
  }

  let cols = null, cur = null   // 列ごとの背景の名前と、いま描いている背景（光をその列にだけ足す）
  const light = (x, y, c, a) => { if (x >= 0 && x < W && cols[x] === cur) addLight(x, y, c, a) }

  const sky = (S) => {
    for (let y = 0; y < H; y++) {
      let c = P.black, c2 = null
      for (let k = 0; k < S.bands.length; k++) {
        if (y >= S.bands[k][0]) c = S.bands[k][1]
        if (k + 1 < S.bands.length && y >= S.bands[k + 1][0] - 12 && y < S.bands[k + 1][0]) c2 = S.bands[k + 1][1]
      }
      for (let x = 0; x < W; x++) fb[y * W + x] = c2 != null && (x + y) % 2 === 0 ? c2 : c
    }
  }
  // 家並み: base（足もとの高さ）、par（流れる割合）、step（家の間隔）、seed、色、shake（陽炎: 行ごとに横へ揺らす）
  const houses = (camX, camY, t, { base, par, step, seed, hMin, hMax, wMin, wMax, body, roof, win, lit, shake = 0, detail = false }) => {
    const off = camX * par, i0 = Math.floor(off / step) - 1
    for (let i = i0; i < i0 + Math.ceil(W / step) + 3; i++) {
      const w = wMin + Math.floor(hash(i, seed) * (wMax - wMin)), hgt = hMin + Math.floor(hash(i, seed + 1) * (hMax - hMin))
      const x0 = Math.round(i * step - off) + Math.floor(hash(i, seed + 2) * (step - w * 0.6)), top = base - hgt
      const bc = body[Math.floor(hash(i, seed + 3) * body.length)], rc = roof ? roof[Math.floor(hash(i, seed + 4) * roof.length)] : bc
      const kind = Math.floor(hash(i, seed + 5) * 3)   // 0 切妻の屋根、1 平らな屋根に手すり、2 丸い屋根
      for (let y = top - 8; y < base + 30; y++) {
        const sx = shake ? Math.round(Math.sin(y * 0.22 + t * 3) * shake) : 0
        for (let x = x0; x < x0 + w; x++) {
          const u = x - x0
          let c = null
          if (y >= top) c = bc
          else if (kind === 0) { const peak = top - 8 + Math.abs(u - w / 2) * (16 / w); if (y >= peak) c = rc }
          else if (kind === 1) { if (y >= top - 2 && (u % 4 === 0 || y === top - 2)) c = rc }
          else { const r = w / 2, dy = top - y; if (dy * dy * 4 + (u - r) * (u - r) <= r * r) c = rc }
          if (c == null) continue
          // 窓: 縦横に並ぶ小さな四角（夕方・夜は灯る）
          if (y >= top + 4 && y < base - 6 && u > 2 && u < w - 3 && (u - 3) % 8 < 3 && (y - top - 4) % 10 < 4) {
            const on = lit && hash(i * 31 + Math.floor((u - 3) / 8), Math.floor((y - top - 4) / 10), seed + 6) < 0.55
            c = lit ? (on ? win : bc) : win
            if (on && (y - top - 4) % 10 === 1) light(x + sx, y, P.or2, 0.12)
          }
          px(x + sx, y, c)
        }
      }
      if (!detail) continue
      // 軒の日よけ（縞）: 下の階に
      if (hash(i, seed + 7) < 0.5) {
        const aw = [P.rd2, P.ye2, P.tl2, P.bl3][Math.floor(hash(i, seed + 8) * 4)]
        for (let y = base - 14; y < base - 10; y++) for (let x = x0 - 2; x < x0 + w + 2; x++) px(x, y, (x - x0) % 6 < 3 ? aw : P.white)
      }
      // 煙突の煙（台所）: ゆっくり昇りながら右へ流れ、薄れる
      if (hash(i, seed + 9) < 0.4 && !lit) {
        const cx = x0 + Math.floor(w * 0.7), cy = top - (kind === 0 ? 6 : 2)
        for (let y = cy - 4; y < cy; y++) px(cx, y, P.gy2), px(cx + 1, y, P.gy2)
        for (let k = 0; k < 6; k++) {
          const ph = (t * 0.35 + k / 6 + hash(i, seed + 10)) % 1, sx = cx + Math.round(ph * 10 + Math.sin(ph * 6 + t) * 2), sy = cy - 5 - Math.round(ph * 22)
          if (ph < 0.85) { px(sx, sy, ph < 0.4 ? P.gy6 : P.gy5); if (ph < 0.5) px(sx + 1, sy, P.gy6) }
        }
      }
      // 吊るした灯り（夕方・夜は光る）
      if (hash(i, seed + 11) < 0.45) {
        const lx = x0 + w + 1, ly = base - 20 + Math.round(Math.sin(t * 1.5 + i) * 0.6)
        px(lx, ly - 2, P.gy2); px(lx, ly, P.rd2); px(lx, ly + 1, P.rd2); px(lx + 1, ly, P.rd3); px(lx + 1, ly + 1, P.rd2)
        if (lit) { light(lx, ly, P.or2, 0.4); for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dy * dy <= 16) light(lx + dx, ly + dy, P.or2, dx * dx + dy * dy <= 4 ? 0.16 : 0.08) }
      }
    }
  }
  // 張り渡した旗: 家と家の間に、ゆるく垂れた綱と、色とりどりの三角の小旗（風に少し揺れる）
  const bunting = (camX, t, base, par, seed) => {
    const off = camX * par, step = 64, i0 = Math.floor(off / step) - 1
    const cs = [P.rd3, P.ye2, P.bl3, P.gr4, P.pk2, P.or2]
    for (let i = i0; i < i0 + Math.ceil(W / step) + 2; i++) {
      if (hash(i, seed) < 0.3) continue
      const x0 = Math.round(i * step - off), y0 = base - 30 - Math.floor(hash(i, seed + 1) * 16), span = step
      for (let u = 0; u <= span; u++) {
        const sag = Math.sin((u / span) * Math.PI) * 6, y = Math.round(y0 + sag)
        px(x0 + u, y, P.gy2)
        if (u % 6 === 2 && u > 2 && u < span - 2) {
          const c = cs[(Math.floor(u / 6) + i) % cs.length], sw = Math.round(Math.sin(t * 3 + u * 0.3 + i) * 0.6)
          for (let j = 1; j <= 3; j++) for (let k = 0; k <= 3 - j; k++) px(x0 + u + k + sw * (j > 1 ? 1 : 0), y + j, c)
        }
      }
    }
  }

  let dawnX0 = 0   // 夜明けの区間の始まり（ドット。drawTownSky が決める）
  const drawScene = (name, camX, camY, t) => {
    const S = SCENES[name], base = 176 - Math.round(camY * 0.04) % 6
    sky(S)
    if (name === 'night') for (let i = 0; i < 60; i++) { const x = Math.floor(((hash(i, 90) * 1000 - camX * 0.05) % W + W) % W), y = Math.floor(hash(i, 91) * 110); px(x, y, hash(i, 92, Math.floor(t * 2)) < 0.1 ? P.gy4 : P.white) }
    if (name === 'dawn') {   // 太陽（夜明けだけ。低く淡く。熱い風の白い太陽は、画面に貼り付いて浮いたので 2026-11-07 に消した）
      //   カメラに合わせて、遠くの家並みよりさらにゆっくり（0.05）流す（空の奥にあるように）。夜明けの区間の始まりから数える
      const sx = Math.round(200 - (camX - dawnX0) * 0.05), sy = 150, r = 22
      for (let y = -r - 6; y <= r + 6; y++) for (let x = -r - 6; x <= r + 6; x++) { const d = Math.hypot(x, y); if (d <= r) px(sx + x, sy + y, P.ye3); else if (d <= r + 6 && (x + y) % 2 === 0) px(sx + x, sy + y, P.pl1) }
    }
    // 遠くの家並み
    // 遠くの層: 水辺は向こう岸なので、川面の上（水平線）に下の端をそろえる
    if (!layer(name, 'far', camX, t, 0.2, name === 'river' ? base - 20 : H - 60, S.lit, name === 'wind' ? 1 : 0)) houses(camX, camY, t, { base: base - 22, par: 0.2, step: 34, seed: 50, hMin: 16, hMax: 46, wMin: 24, wMax: 40, body: [S.far[1]], roof: [S.far[0]], win: S.far[2], lit: S.lit, shake: name === 'wind' ? 1 : 0 })
    if (name === 'river') {
      // 川面（2026-11-07。大人しく描き直した）: 落ち着いた帯（水平線の近くは明るい青、手前は少し濃い青）の上に、小さな波の印（〜の形の短い弧）を
      //   まばらに散らす。遠くは小さく詰め、手前は大きくゆったり。印はゆっくり横に流れて 1 ドット上下にゆれ、ときどき消えては現れる。白いきらめきはごくたまに
      const h0 = base - 22
      for (let y = h0; y < H; y++) { const c = y < h0 + 10 ? P.bl4 : P.bl3; for (let x = 0; x < W; x++) px(x, y, c) }
      for (let r = 0, y = h0 + 3; y < H; r++, y += 3 + Math.floor(r * 1.4)) {
        const k = (y - h0) / (H - h0), gap = 18 + Math.floor(k * 30), w = 3 + Math.floor(k * 6), par = 0.3 + k * 0.3
        const off = camX * par + t * (2 + k * 3), i0 = Math.floor(off / gap) - 1
        for (let i = i0; i < i0 + Math.ceil(W / gap) + 3; i++) {
          const seed = hash(i, r, 63)
          if (Math.sin(t * 0.7 + seed * 40) < -0.2) continue   // ときどき消えては現れる
          const x0 = Math.round(i * gap + seed * gap * 0.8 - off), yy = y + Math.round(Math.sin(t * 1.3 + seed * 9))
          const c = k < 0.3 ? P.bl5 : P.bl5, top = seed > 0.93 && Math.sin(t * 2 + seed * 30) > 0.8 ? P.white : c
          for (let u = 1; u < w - 1; u++) px(x0 + u, yy - 1, u === Math.floor(w / 2) ? top : c)   // 弧の上の線
          px(x0, yy, c); px(x0 + w - 1, yy, c)   // 弧の両はし
        }
      }
      // 舟（Pixel の peta/boat があればそれ。帆掛け舟 sail1・sail2 と、あれば渡し舟 row1・row2 を一艘おきに。コマを替えて揺らす。無ければコードの帆掛け舟）
      const boat = ART['peta/boat'], sails = boat ? Object.keys(boat.pics).filter((n) => /^sail/.test(n)).sort() : [], rows2 = boat ? Object.keys(boat.pics).filter((n) => /^row/.test(n)).sort() : []
      for (let k = 0; k < 4; k++) {
        const x = Math.round((((hash(k, 60) * 700 + t * (5 + k * 2) - camX * 0.3) % 700) + 700) % 700) - 180, y = base - 12 + k * 6 + Math.round(Math.sin(t * 1.6 + k) * 1)
        if (x < -30 || x > W + 30) continue
        const boatPics = k % 2 && rows2.length ? rows2 : sails
        if (boatPics.length) {
          const rows = boat.pics[boatPics[(Math.floor(t * 2 + k) % boatPics.length)]]
          rows.forEach((r, j2) => [...r].forEach((ch, i2) => { if (ch !== '.') { const yy = y + 2 - rows.length + j2; px(x + i2, yy, boat.colors[ch]); if (tint && yy < h0) tint(x + i2, yy, P.white, NEAR_HAZE) } }))   // 水平線より上にはみ出した帆にも白を
          continue
        }
        for (let u = 0; u < 22; u++) { px(x + u, y, P.br2); if (u > 2 && u < 19) px(x + u, y + 1, P.br1) }
        for (let j2 = 1; j2 < 12; j2++) for (let u = 0; u < Math.max(1, 12 - j2); u++) { px(x + 8 + u, y - j2, j2 < 2 ? P.br2 : P.sa3); if (tint && y - j2 < h0) tint(x + 8 + u, y - j2, P.white, NEAR_HAZE) }
      }
      // 川面と舟にも、近くの層と同じ白を重ねる（町と同じくらいの白っぽさに。2026-11-07）
      if (tint) for (let y = h0; y < H; y++) for (let x = 0; x < W; x++) tint(x, y, P.white, NEAR_HAZE)
      // 手前の岸辺: Pixel の近くの層（peta/river の near）があれば、それ（川面と舟より手前。白を重ねて淡く）。無ければコードの葦
      if (layer(name, 'near', camX, t, 0.45, H, S.lit, 0, NEAR_HAZE)) return
      for (let x = 0; x < W; x++) { const wx = x + camX * 0.6; if (hash(Math.floor(wx / 3), 61) < 0.5) { const h = 6 + Math.floor(hash(Math.floor(wx / 3), 62) * 10); for (let j = 0; j < h; j++) px(x + Math.round(Math.sin(t * 2 + wx * 0.2) * (j / h) * 1.5), H - 1 - j, j > h - 3 ? P.gr4 : P.gr2) } }
      return
    }
    // 近くの家並み（町・夕方・夜・夜明けは飾りつき）
    const detail = name !== 'wind'
    if (!layer(name, 'near', camX, t, 0.45, H, S.lit, 0, NEAR_HAZE)) {
      if (detail) bunting(camX, t, base, 0.45, 70)
      houses(camX, camY, t, { base, par: 0.45, step: 52, seed: 80, hMin: 26, hMax: 62, wMin: 30, wMax: 48, body: S.near, roof: S.roof, win: S.win, lit: S.lit, detail })   // 陽炎は遠くの家並みだけ（近くまで揺らすと溶けて見えた）
    }
    if (name === 'wind') {
      // 右へ吹き流れる砂ぼこり（1 ドットの粒。2026-11-07 に線から粒にした）: 速さ・上下のゆれ（幅と速さ）・流れる高さ・舞い上がりを一粒ずつばらばらに。
      //   ときどき消えては現れる。色は明るい砂色・薄い茶・濃い茶を混ぜる（枯れ木は、家並みの屋根に生えて見えたので 2026-11-07 に消した）
      for (let k = 0; k < 70; k++) {
        const r1 = hash(k, 97), r2 = hash(k, 98), r3 = hash(k, 99), r4 = hash(k, 96)
        const sp = 45 + r2 * 110, period = 600 + Math.floor(r4 * 200)
        const u = ((r1 * period + t * sp - camX * (0.5 + r2 * 0.3)) % period + period) % period
        const x = Math.floor(u) - 140
        if (x < -2 || x > W + 2) continue
        if (Math.sin(t * (0.6 + r4) + k * 2.3) < -0.4) continue   // ときどき消える
        const rise = (u / period) * (8 + r3 * 18) * (r4 > 0.6 ? 1 : 0)   // 一部は流れながら舞い上がる
        const y = Math.floor(20 + r3 * (H - 50) - rise + Math.sin(t * (1.5 + r1 * 3) + k) * (1 + r2 * 3))
        px(x, y, r4 < 0.4 ? P.sa3 : r4 < 0.8 ? P.br5 : P.br4)
      }
    }
  }

  // 背景を描く（空より手前、岩のタイルより奥）
  const drawTownSky = (world, camX, camY, t) => {
    haze.reset()
    const m = roomScenes(world)
    dawnX0 = Math.min(...world.rooms.filter((r) => m.get(r.index) === 'dawn').map((r) => r.x * TILE), 1e9) % 1e9
    cols = new Array(W)
    const ty = Math.floor((camY + H / 2) / TILE)
    let last = 'town'
    for (let x = 0; x < W; x++) {
      const tx = Math.floor((camX + x) / TILE), ri = tx >= 0 && ty >= 0 && tx < world.w && ty < world.h ? world.roomOf[ty * world.w + tx] : -1
      cols[x] = ri >= 0 ? m.get(ri) : last
      last = cols[x]
    }
    const names = [...new Set(cols)]
    if (names.length === 1) { cur = names[0]; drawScene(cur, camX, camY, t); haze.apply(); return }
    // 二つ以上の背景が見えるとき: 一つずつ描いて、その背景の列だけを集める
    const out = new fb.constructor(fb.length), outHaze = new Float32Array(fb.length)
    for (const nm of names) {
      cur = nm
      drawScene(nm, camX, camY, t)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cols[x] === nm) { out[y * W + x] = fb[y * W + x]; outHaze[y * W + x] = haze.a[y * W + x] }
      haze.reset()
    }
    fb.set(out); haze.a.set(outHaze); haze.apply()
  }
  return { drawTownSky, SCENE_NAMES: Object.keys(SCENES) }
}
