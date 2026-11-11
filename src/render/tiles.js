// 地面のタイル: 岩の形のなめらかさ、溶岩・水、針（棘）、噴火口のふた、色を失った景色の灰色
import { P } from '../palette.js'
import { TILE, K, tileAt, CRUMBLE } from '../world.js'
import { ART } from '../art.js'
import { ALL_HEX } from '../shade.js'
import { W, H, hash, RGB, realmOf } from './base.js'

export function makeTiles({ fb, px, artPic }) {
  // 棘の色: 針の絵の色を、明るさで茶と緑の段に置き換える（地獄のほかの道。絵が道ごとにできるまで）
  const THORN_STEPS = [P.black, P.br0, P.br1, P.br2, P.br3, P.br4, P.gr4, P.gr5, P.gr6]
  const thornCache = new Map()
  const thornColor = (c) => {
    if (thornCache.has(c)) return thornCache.get(c)
    const [r, g, b] = RGB[c], l = (r * 0.3 + g * 0.59 + b * 0.11) / 255
    const v = r > 150 && g < 90 ? P.rd2 : THORN_STEPS[Math.min(THORN_STEPS.length - 1, Math.floor(l * THORN_STEPS.length))]   // 血の赤は残す
    thornCache.set(c, v)
    return v
  }

  const rockCache = new Map()
  // 光の部屋の岩の色: 暗い色を淡い青と白に
  const LIGHT_MAP = new Map([[P.black, P.gy4], [P.ink, P.gy5], [P.gy1, P.gy6], [P.gy2, P.gy5], [P.rd0, P.bl5], [P.rd1, P.white], [P.rd2, P.white], [P.or1, P.white], [P.or2, P.white], [P.br0, P.sa2], [P.br1, P.sa3], [P.br2, P.gy6], [P.gr0, P.gr5], [P.gr1, P.gr6], [P.gr2, P.gr6], [P.gr3, P.white], [P.gr4, P.white]])
  //   再び人も、道の地面の絵は一つ（realms.js の tiles）。2026-11-07 までは区切り（sections）ごとにその道の地面の絵を使っていたが、
  //   灰色にすると明るい所と暗い所が入れ替わるだけで、何を表しているか分かりにくかったのでやめた
  const tileRefOf = (world) => realmOf(world).tiles
  // 色を失った景色（再び人）: パレットの色を、明るさの近い灰色に置き換える表
  const GRAYS = [P.black, P.ink, P.gy1, P.gy2, P.gy3, P.gy4, P.gy5, P.gy6, P.white]
  const lumOf = (i) => { const h = ALL_HEX[i] || '000000'; return parseInt(h.slice(0, 2), 16) * 0.3 + parseInt(h.slice(2, 4), 16) * 0.59 + parseInt(h.slice(4, 6), 16) * 0.11 }
  const GRAY = new Uint8Array(256).map((_, i) => GRAYS.reduce((best, g) => (Math.abs(lumOf(g) - lumOf(i)) < Math.abs(lumOf(best) - lumOf(i)) ? g : best), GRAYS[0]))

  // 岩の形をなめらかにする（gunzo の地面の境目と同じ考え）: 出っ張った角は半径 ROUND で丸め、へこんだ角（岩の間の空のマス）は半径 FILLET で埋める。
  //   当たりはマスのまま。乗る面の上はまっすぐのまま（角だけ丸い）。縁の色は Pixel の top・bottom・left・right を、丸めた輪郭に沿って塗る
  //   key: 中身の絵の番号（空のマスは a）と、まわり 5×5 マスの並び。返すのは 16×16 の色（-1 は描かない）
  const ROUND = 5, ROUND_TOP = 3, FILLET = 4   // 乗る面の上の角は小さく丸める（縁に立って足が浮いて見えないように）
  const smoothRock = (fullKey) => {
    const [ref, key] = fullKey.split('|')
    const [vs, grid] = key.split(':')
    const kind = (bx, by) => (bx < -2 || by < -2 || bx > 2 || by > 2 ? 1 : Number(grid[(by + 2) * 5 + bx + 2]))
    const S = (bx, by) => kind(bx, by) === 1
    const out = (d, r) => d > r * r   // 角の円の外
    const solidPx = (x, y) => {
      const bx = Math.floor(x / 16), by = Math.floor(y / 16), i = x - bx * 16, j = y - by * 16
      const up = S(bx, by - 1), dn = S(bx, by + 1), lf = S(bx - 1, by), rt = S(bx + 1, by)
      if (S(bx, by)) {
        const R = j < 8 ? ROUND_TOP : ROUND
        const ci = i < 8 ? R - 0.5 - i : i - (15.5 - R), cj = j < 8 ? R - 0.5 - j : j - (15.5 - R)
        const openV = j < 8 ? !up : !dn, openH = i < 8 ? !lf : !rt
        if (openV && openH && ci > 0 && cj > 0 && out(ci * ci + cj * cj, R)) return false
        // 壁の横の面と天井の下の面は、ゆるい波で 1 ドット欠ける（乗る面の上はまっすぐ）。波はマスの中で一周して、となりとつながる
        const ph = vs === 'a' ? 0 : Number(vs) * 1.7
        const wave = (u, side) => Math.sin((u / 16) * Math.PI * 2 * 2 + ph + side) + 0.6 * Math.sin((u / 16) * Math.PI * 2 * 3 + side * 2.3) > 0.9
        //   岩につながる端の 3 ドットにはかけない（欠けた所の下の岩が「上の面」になって、赤い縁が出てしまうので）
        const midV = (!up || j > 2) && (!dn || j < 13), midH = (!lf || i > 2) && (!rt || i < 13)
        if (i === 0 && !lf && midV && wave(j, 1)) return false
        if (i === 15 && !rt && midV && wave(j, 2)) return false
        if (j === 15 && !dn && midH && wave(i, 3)) return false
        return true
      }
      if (kind(bx, by) !== 0) return false
      const fi = i < 8 ? FILLET - 0.5 - i : i - (15.5 - FILLET), fj = j < 8 ? FILLET - 0.5 - j : j - (15.5 - FILLET)
      const shutV = j < 8 ? up : dn, shutH = i < 8 ? lf : rt
      return shutV && shutH && fi > 0 && fj > 0 && out(fi * fi + fj * fj, FILLET)
    }
    const pics = ART[ref].pics
    const centers = Object.keys(pics).filter((n) => n.startsWith('center'))
    const tex = artPic(ref, centers[(vs === 'a' ? 0 : Number(vs)) % centers.length] || centers[0])
    const edge = (name) => artPic(ref, name)
    const top = edge('top'), bottom = edge('bottom'), left = edge('left'), right = edge('right')
    const b = new Int16Array(256).fill(-1)
    const dist = (x, y, dx, dy) => { for (let d = 1; d <= 4; d++) if (!solidPx(x + dx * d, y + dy * d)) return d; return 99 }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (!solidPx(x, y)) continue
      let c = tex.colors[tex.rows[y][x]]
      const paint = (pic, ch) => { if (pic && ch && ch !== '.') c = pic.colors[ch] }
      const du = dist(x, y, 0, -1), dd = dist(x, y, 0, 1), dl = dist(x, y, -1, 0), dr = dist(x, y, 1, 0)
      if (du <= 4) paint(top, top?.rows[du - 1]?.[x])
      if (dd <= 4) paint(bottom, bottom?.rows[16 - dd]?.[x])
      if (dl <= 4) paint(left, left?.rows[y]?.[dl - 1])
      if (dr <= 4) paint(right, right?.rows[y]?.[16 - dr])
      b[y * 16 + x] = c
    }
    return b
  }
  // 餓鬼の道の川: 餓鬼（プレイヤー）から近い所ほど血に見える（56 ドットまでは血、90 ドットまでで水へ移る）
  let bloodFrom = null
  const bloodNear = (wx, wy, h) => { if (!bloodFrom) return false; const d = Math.hypot(wx - bloodFrom.x, wy - bloodFrom.y); return d < 56 || (d < 90 && h > (d - 56) / 34) }
  // 崩れる岩（人の道。2026-11-10）: まわりの岩とはつながらない、ひびの入った一つの塊。絵は道の土のタイルの top（無ければ center1）に、ひびを重ねる。
  //   乗っている間（k: 0〜1）は、ひびが伸びて、左右にがたがた揺れる。崩れたら破片が落ちる（drawCrumbleFx）
  //   Pixel の tiles/crumble（block → crack1 → crack2。乗っている間に進む）があれば、その絵を使う（揺れはゲーム）。無ければ、土のタイルにひびを描く
  const drawCrumble = (world, tx, ty, sx, sy, k = 0) => {
    const jit = k > 0 ? (Math.floor(k * 40) % 2 ? 1 : -1) * (k > 0.5 ? 1 : 0) : 0
    const own = ART['tiles/crumble']
    if (own?.pics?.block) {
      const name = (k >= 0.67 && (own.pics.crack2 ? 'crack2' : own.pics.crack1 && 'crack1')) || (k >= 0.34 && own.pics.crack1 && 'crack1') || 'block'
      own.pics[name].forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.' && own.colors[ch] != null) px(sx + i + jit, sy + j, own.colors[ch]) }))
      return
    }
    const a = ART[tileRefOf(world)], rows = a?.pics?.top || a?.pics?.center1
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const ch = rows?.[j]?.[i]
      let c = ch && ch !== '.' ? a.colors[ch] : (j < 2 ? P.br4 : P.br3)
      if (i === 0 || i === 15 || j === 15) c = P.br1   // 縁取り（まわりの岩と見分ける）
      px(sx + i + jit, sy + j, c)
    }
    // ひび: 上から斜めに 3 本。乗っている間に下へ伸びる
    for (let n = 0; n < 3; n++) {
      let x = 3 + n * 5 + Math.floor(hash(tx, ty, 70 + n) * 3), len = 5 + Math.floor(k * 9)
      for (let j = 2; j < 2 + len && j < 15; j++) { px(sx + x + jit, sy + j, P.br1); if (hash(tx * 7 + n, j, 71) < 0.35) x += hash(tx, j + n, 72) < 0.5 ? -1 : 1; x = Math.max(1, Math.min(14, x)) }
    }
  }
  // 崩れた瞬間の破片: 塊が小さなかけらになって、ばらばらに落ちる（1 秒。土ぼこりも少し）
  const drawCrumbleFx = (S, world, camX, camY) => {
    for (const f of S.crumbleFx || []) {
      const x0 = f.x - camX, y0 = f.y - camY
      for (let n = 0; n < 12; n++) {
        const vx = (hash(f.seed, n, 73) - 0.5) * 50, vy = -10 - hash(f.seed, n, 74) * 30, x = x0 + 2 + (n % 4) * 4 + vx * f.t, y = y0 + 2 + Math.floor(n / 4) * 4 + vy * f.t + 300 * f.t * f.t
        if (f.t > 0.7 && (n + Math.floor(f.t * 20)) % 2) continue
        const c = n % 3 ? P.br3 : P.br1
        px(Math.round(x), Math.round(y), c); if (f.t < 0.4) { px(Math.round(x) + 1, Math.round(y), c); px(Math.round(x), Math.round(y) + 1, P.br2) }
      }
      for (let n = 0; n < 6; n++) { const k = Math.min(1, f.t * 1.5); if ((n + Math.floor(f.t * 12)) % 3) px(Math.round(x0 + 8 + (hash(f.seed, n, 75) - 0.5) * 20 * (0.5 + k)), Math.round(y0 + 14 - k * 4 * hash(f.seed, n, 76)), P.gy5) }
    }
  }
  const drawTile = (world, tx, ty, sx, sy, t, crumbleK = 0) => {
    let k = tileAt(world, tx, ty)
    if (k === K.crumble) { drawCrumble(world, tx, ty, sx, sy, crumbleK); return true }
    // すり抜けの岩と扉は、普通の岩と見分けがつかないように描く
    const rocky = (v) => v === K.rock || v === K.hidden || v === K.door
    const solid = (x, y) => { const v = tileAt(world, x, y); return rocky(v) || v === K.jet }
    if (rocky(k)) k = K.rock
    const water = world.realm !== 'hell', thorn = world.realm !== 'hell'   // 地獄のほかでは、炎は水（餓鬼は近くが血）、針は棘
    const ref = tileRefOf(world)
    // 再び人: 模様や波は、一周の中の位置で選ぶ（継ぎ目の両側の写しが、同じ模様になるように）
    const ntx = world.loop ? world.loop.x0 / TILE + ((((tx - world.loop.x0 / TILE) % (world.loop.len / TILE)) + world.loop.len / TILE) % (world.loop.len / TILE)) : tx
    if ((k === K.rock || k === K.air) && ART[ref]) {
      // まわり 5×5 マスの並び（0 空・1 岩・2 そのほか）で形が決まる。並びごとに一度だけ作って覚える（道の絵ごとに）
      let key = `${ref}|` + (k === K.rock ? `${Math.floor(hash(ntx, ty, 21) * 4)}:` : 'a:')
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const v = tileAt(world, tx + dx, ty + dy); key += solid(tx + dx, ty + dy) ? 1 : v === K.air ? 0 : 2 }
      if (k === K.air && !key.includes('1')) return false
      let b = rockCache.get(key)
      if (!b) { b = smoothRock(key); rockCache.set(key, b) }
      let drew = false
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if (b[j * 16 + i] >= 0) { px(sx + i, sy + j, b[j * 16 + i]); drew = true }
      return drew
    } else if (k === K.fire || k === K.fakeFire) {   // すり抜けの炎も、見た目は炎と同じ（見分けられないのが仕掛け）
      const up = tileAt(world, tx, ty - 1), top = up !== K.fire && up !== K.fakeFire
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const wave = Math.sin((ntx * 16 + x) * 0.5 + t * 6) * 2 + Math.sin((ntx * 16 + x) * 0.21 - t * 3) * 1.5
        if (top && y < 6 + wave) continue
        const h = hash(ntx * 16 + x, Math.floor(t * 8) + y, 2)
        // 餓鬼の道の川は、餓鬼が近づくほど血に変わる（『餓鬼事』2.10）
        const blood = world.realm === 'peta' && bloodNear(tx * TILE + x, ty * TILE + y, h)
        if (blood) px(sx + x, sy + y, top && y < 7 + wave ? (h < 0.5 ? P.rd3 : P.rd2) : h < 0.12 ? P.rd2 : y > 11 ? P.rd0 : P.rd1)
        else if (water) px(sx + x, sy + y, top && y < 7 + wave ? (h < 0.5 ? P.wt3 : P.bl5) : h < 0.12 ? P.wt2 : y > 11 ? P.bl1 : P.wt1)
        else px(sx + x, sy + y, top && y < 9 + wave ? (h < 0.5 ? P.ye2 : P.or2) : h < 0.15 ? P.or2 : P.or1)
      }
    } else if (k === K.spikeUp || k === K.spikeDown || k === K.spikeRight || k === K.spikeLeft) {
      // Pixel の針（tiles/spikes。上向きの絵だけ。spike1〜。場所ごとに選び、90 度ずつ回して天井・壁に使う）。棘の道は、明るさで茶と緑に塗り替える
      //   畜生は、専用の棘の絵（tiles/thorns の thorn1〜。鈍角で明るい。血は無い。2026-11-06）があればそれをそのまま使う
      const own = (world.realm === 'animal' || world.realm === 'human') && ART['tiles/thorns']   // 人の道も、畜生と同じ棘（2026-11-10）
      const sp = own || ART['tiles/spikes']
      const names = Object.keys(sp?.pics ?? {}).filter((nm) => (own ? /^thorn/ : /^spike/).test(nm)).sort()
      const rows = sp?.pics[names[Math.floor(hash(ntx, ty, 60 + k) * names.length)] ?? names[0]]
      if (rows) rows.forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch === '.') return
        let c = sp.colors[ch]
        if (thorn && !own) c = thornColor(c)
        const [x, y] = k === K.spikeUp ? [i, j] : k === K.spikeDown ? [15 - i, 15 - j] : k === K.spikeRight ? [15 - j, i] : [j, 15 - i]
        px(sx + x, sy + y, c)
      }))
    } else if (k === K.jet) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(sx + x, sy + y, (x + y) % 4 === 0 ? P.gy1 : P.gy2)   // 口の絵は drawJet が上に描く（予兆で揺れて、奥が灯る）
    }
  }


  // 見えているタイルを全部描く。光の部屋の岩は白っぽく光る（いる部屋は満ちたとき、ほかの部屋は見つけていれば）
  const drawTiles = (world, S, lit, camX, camY, t) => {
    const tx0 = Math.floor(camX / TILE), ty0 = Math.floor(camY / TILE)
    for (let ty = ty0; ty <= ty0 + 15; ty++) for (let tx = tx0; tx <= tx0 + 20; tx++) {
      const sx = tx * TILE - camX, sy = ty * TILE - camY
      const ci = ty * world.w + tx, ck = S.crumbleT?.get(ci) ?? 0   // 崩れる岩に乗っている時間（揺れ・ひび）
      const ca = S.crumbleIn?.get(ci)   // 崩れる岩が戻ってくる途中（ぽつぽつ現れる）
      let drew
      if (ca != null) { const keep = px, k = ca / CRUMBLE.appear; px = (X, Y, c) => { if (hash(X - sx, Y - sy, 23) < k) keep(X, Y, c) }; try { drew = drawTile(world, tx, ty, sx, sy, t) } finally { px = keep } }
      else drew = drawTile(world, tx, ty, sx, sy, t, ck / CRUMBLE.hold)
      // 光の部屋の岩は、白っぽく光る（いる部屋は満ちたとき、ほかの部屋は見つけていれば）
      const ri = tx >= 0 && ty >= 0 && tx < world.w && ty < world.h ? world.roomOf[ty * world.w + tx] : -1
      const on = ri >= 0 && world.rooms[ri].light && (ri === S.room?.index ? lit : S.found?.has(ri))
      if (on && (tileAt(world, tx, ty) !== K.air || drew)) {
        for (let j = 0; j < 16; j++) { const yy = sy + j; if (yy < 0 || yy >= H) continue; for (let i = 0; i < 16; i++) { const xx = sx + i; if (xx < 0 || xx >= W) continue; const o = yy * W + xx; fb[o] = LIGHT_MAP.get(fb[o]) ?? fb[o] } }
      }
    }
    drawCrumbleFx(S, world, camX, camY)   // 崩れた岩の破片
  }

  // 針は花より手前に（花が針の奥に咲いて見えるように。2026-11-05）: 見えている針のタイルを、花のあとにもう一度描く。再び人は色を失わせる
  const drawSpikesFront = (world, camX, camY, t) => {
    const gray = !!realmOf(world).sections, tx0 = Math.floor(camX / TILE), ty0 = Math.floor(camY / TILE)
    for (let ty = ty0; ty <= ty0 + 15; ty++) for (let tx = tx0; tx <= tx0 + 20; tx++) {
      const k = tileAt(world, tx, ty)
      if (k !== K.spikeUp && k !== K.spikeDown && k !== K.spikeRight && k !== K.spikeLeft) continue
      const sx = tx * TILE - camX, sy = ty * TILE - camY
      if (!gray) { drawTile(world, tx, ty, sx, sy, t); continue }
      const before = []
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { const x = sx + i, y = sy + j; if (x >= 0 && y >= 0 && x < W && y < H) before.push(fb[y * W + x]) }
      drawTile(world, tx, ty, sx, sy, t)
      let n = 0
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { const x = sx + i, y = sy + j; if (x >= 0 && y >= 0 && x < W && y < H) { const o = y * W + x; if (fb[o] !== before[n]) fb[o] = GRAY[fb[o]]; n++ } }
    }
  }

  // 再び人: 景色は色を失う（このあとに描く花・誘うもの・プレイヤーだけに色が残る）
  const grayScreen = () => { for (let i = 0; i < W * H; i++) fb[i] = GRAY[fb[i]] }

  return { drawTiles, drawSpikesFront, grayScreen, setBloodFrom: (v) => { bloodFrom = v } }
}
