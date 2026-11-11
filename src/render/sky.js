// 背景（空）: 道ごとの空、地獄の空の波と照り返し、燃えカス・蛍、遠くの家並み・丘・雲
import { P } from '../palette.js'
import { ART } from '../art.js'
import { makeTownSky } from './town.js'
import { makeVillageSky } from './village.js'
import { TILE, K, tileAt, isSolidKind } from '../world.js'
import { W, H, hash, realmOf } from './base.js'

export function makeSky({ fb, px, addLight, tint }) {
  const town = makeTownSky({ fb, px, addLight, tint })   // 餓鬼の道の背景（src/render/town.js。部屋の scene で描き分ける）
  const village = makeVillageSky({ fb, px, tint })   // 人の道の背景（src/render/village.js。部屋の scene で描き分け、登るほど地平が下がる）
  // 地獄の空（2026-11-05）: 上は闇、下ほど炎の照り返しで赤い三段の帯。その境目がうねる（下から炎が舐め上げるように）
  //   境目の波は 2 本ずつ重ね、速さ・波長・カメラについて来る量を変えて奥行きを出す。境目のぼかしは市松（12 ドット）
  //   陽炎: 下の熱い所ほど、段ごとに左右へ 1〜2 ドットゆっくりずらす（上の闇は揺らさない）。岩とキャラは揺らさない
  //   色は元の帯と同じパレットの色だけ。遊ぶ所（針・噴火口・火の粉）より目立たないよう、動きはゆっくり
  let hellSkyBuf = null   // 描いた地獄の空の写し（照り返しを、空のまま見えている所にだけ当てるため）
  const drawHellSky = (camX, camY, t) => {
    const cx = Math.round(camX)
    //   上の境目（k = 0）は速く（2026-11-05 に本人の頼みで 2 倍）。尖りの項（|sin| で谷が尖る）で、炎の舌のようにギザギザに
    const edge = (x, base, par, k) => {
      const sp = k === 0 ? 2 : 1
      return base
        + 6 * Math.sin((x + cx * par) / (29 + k * 7) + t * sp * (0.45 + k * 0.1) + k * 2.1)
        + 3 * Math.sin((x + cx * par * 1.6) / (11 + k * 3) - t * sp * (0.9 + k * 0.2) + k)
        + 4 * Math.abs(Math.sin((x + cx * par * 1.3) / (6 + k) + t * sp * 1.4 + k * 3)) - 2
    }
    // 境目の高さは列ごとに先に計算しておく（陽炎でずれる 2 ドットぶん、両端に余分を取る）
    const E1 = new Float32Array(W + 4), E2 = new Float32Array(W + 4)
    for (let i = 0; i < W + 4; i++) { E1[i] = edge(i - 2, 100, 0.12, 0); E2[i] = edge(i - 2, 150, 0.22, 1) }
    for (let y = 0; y < H; y++) {
      const heat = Math.max(0, (y - 80) / (H - 80))
      const shift = Math.round(heat * 2 * Math.sin(y / 7 + t * 1.1) * (0.6 + 0.4 * Math.sin(t * 0.37 + y / 31)))
      const row = y * W
      for (let x = 0; x < W; x++) {
        const hx = x + shift
        const e1 = E1[hx + 2], e2 = E2[hx + 2]
        let c = y >= e2 ? P.rd0 : y >= e1 ? P.pu0 : P.black
        // 境目の手前 12 ドットは、次の色を市松に混ぜる
        if (y < e1 && y >= e1 - 12) c = (hx + y) % 2 === 0 ? P.pu0 : c
        else if (y < e2 && y >= e2 - 12) c = (hx + y) % 2 === 0 ? P.rd0 : c
        fb[row + x] = c
      }
    }
    hellSkyBuf = fb.slice()
  }
  // 地獄の照り返し（光の層。パレットに縛られない）: 画面の下から赤い光。数秒でゆっくり息をし、ときどき遠くで炎が噴いたように「ぼっ」と強まる
  //   光は背景（空気のタイルで、空の色のまま残った所）にだけ。強さは 4 段に刻む
  const hellGlow = (world0, camX, camY, t) => {
    const breath = 0.5 + 0.5 * Math.sin(t * 1.25)
    // 噴き: 7 秒ごとの枠のうち、種で決めた枠でだけ。速く出て（0.15 秒）、ゆっくり引く（1.6 秒）
    const slot = Math.floor(t / 7), since = t - slot * 7 - hash(slot, 41) * 3
    const flare = hash(slot, 42) < 0.6 && since > 0 ? (since < 0.15 ? since / 0.15 : Math.max(0, 1 - (since - 0.15) / 1.6)) : 0
    const power = 0.35 + 0.35 * breath + 0.6 * flare
    const cx = Math.round(camX), cy = Math.round(camY)
    // 光の段の境目も、炎が舐めるようにうねらせる（まっすぐな縞にしない）
    const lick = new Float32Array(W)
    for (let x = 0; x < W; x++) lick[x] = 7 * Math.sin((x + cx * 0.3) / 17 + t * 1.3) + 4 * Math.sin((x + cx * 0.4) / 7 - t * 2.1) + 3 * Math.sin((x + cx * 0.3) / 41 - t * 0.6) + 4 * Math.abs(Math.sin((x + cx * 0.35) / 5 + t * 1.9)) - 2
    for (let y = 96; y < H; y++) {
      const ty = Math.floor((y + cy) / TILE)
      for (let x = 0; x < W; x++) {
        const v = power * Math.max(0, (y + lick[x] - 110) / (H - 110)) ** 1.5
        const lv = Math.round(v * 3) / 3 * 0.32   // 4 段（0・1・2・3）
        if (lv <= 0) continue
        const f = fb[y * W + x]
        // 空の色のまま残った所だけ（溶岩・針・噴火口のタイルの、絵の無い透けた所にも光る。岩・隠し通路・扉は、色がたまたま同じでも光らせない）
        if (f !== hellSkyBuf[y * W + x]) continue
        const k = tileAt(world0, Math.floor((x + cx) / TILE), ty)
        if (k === K.rock || k === K.hidden || k === K.door) continue
        addLight(x, y, P.rd2, lv)
      }
    }
  }

  // 畜生の空（2026-11-06。地獄の次なので、明るい昼下がりの森に）: 上は澄んだ空色、下へ淡く。遠くと近くの二段の梢の並び（丸い樹冠）が、
  //   風が渡るように左から右へ波打ってそよぐ（遠くは小さくゆっくり、近くは大きく）。樹冠の上の縁だけ日の当たる明るい色（重なりの影の線は 2026-11-06 にやめた）。
  //   色はパレットの淡い色だけ（遊ぶ所の岩・カエル・生き物より目立たないように）
  let forestBuf = null
  // x の列での、梢の並びの上の端（並びの根もとからの高さ）。丸い樹冠を重ねたいちばん高い所
  const crowns = (x, cx, par, gap, r0, rv, seed, t, sway) => {
    const wx = x + cx * par, i0 = Math.floor(wx / gap)
    // 風の波: 梢の上の端が、左から右へ渡る波で上下する
    const wave = sway * 1.2 * Math.sin(wx / 37 - t * 1.3) + sway * 0.6 * Math.sin(wx / 13 - t * 2.1)
    let top = wave * 0.5   // 樹冠の無い所も、並びの根もとまでは埋める（隙間から空が下まで見えないように）
    for (let i = i0 - 2; i <= i0 + 2; i++) {
      const r = r0 + hash(i, seed) * rv, cxw = i * gap + hash(i, seed + 1) * gap * 0.6 + sway * Math.sin(t * 0.9 + i * 1.7)
      const d = wx - cxw
      if (Math.abs(d) < r) top = Math.max(top, Math.sqrt(r * r - d * d) * 0.8 + hash(i, seed + 2) * 10 + wave)
    }
    return top
  }
  const drawForestSky = (camX, camY, t) => {
    const cx = Math.round(camX)
    // 二段の梢: base は並びの根もと（画面の y）、body は中の色、rim は上の端（日の当たる色）
    const layers = [
      { base: 140, par: 0.12, gap: 16, r0: 11, rv: 7, seed: 90, sway: 1.0, body: P.sg1, rim: P.gr6 },
      { base: 182, par: 0.25, gap: 24, r0: 16, rv: 9, seed: 95, sway: 2.0, body: P.sg2, rim: P.gr5 },
    ]
    const tops = layers.map((L) => Int16Array.from({ length: W }, (_, x) => Math.round(L.base - crowns(x, cx, L.par, L.gap, L.r0, L.rv, L.seed, t, L.sway))))
    for (let y = 0; y < H; y++) {
      const row = y * W
      for (let x = 0; x < W; x++) {
        // 空: 上は空色、70 から淡く（境目 12 ドットは市松）
        let c = y < 70 ? ((y >= 58 && (x + y) % 2 === 0) ? P.bl5 : P.bl4) : P.bl5
        layers.forEach((L, k) => { const top = tops[k][x]; if (y >= top) c = y === top ? L.rim : L.body })
        fb[row + x] = c
      }
    }
    forestBuf = fb.slice()
  }
  // 畜生の木漏れ日（光の層）: 斜めの光の筋が、ぱっと差して 2〜3 秒そのまま、ぱっと消える（2026-11-06。ゆっくり満ち引きさせると、もたついて見えた）。
  //   筋ごとに周期をずらし、回るたびに差す場所と太さを変える。筋の真ん中ほど明るい 3 段で、上から下まで同じ（下で弱めると、明るい段が途中で切れて見えた）。
  //   空の色のまま見えている所にだけ
  const forestGlow = (world0, camX, camY, t) => {
    const cx = Math.round(camX), cy = Math.round(camY)
    for (let k = 0; k < 4; k++) {
      const period = 6 + hash(k, 62) * 5, u = t / period + hash(k, 63), cyc = Math.floor(u)
      if ((u - cyc) * period > 2 + hash(k, cyc, 64) * 1.2) continue                         // 休み
      const w = 8 + hash(k, cyc, 60) * 16, x0 = ((hash(k, cyc, 61) * 520 - cx * 0.1) % 520 + 520) % 520 - 100
      for (let y = 0; y < H; y++) {
        const ty = Math.floor((y + cy) / TILE), xs = x0 + y * 0.45
        for (let x = Math.max(0, Math.floor(xs)); x < Math.min(W, xs + w); x++) {
          const edge = Math.min(x - xs, xs + w - x) / (w / 2)                              // 筋の真ん中ほど強く
          const lv = Math.round(Math.min(1, edge * 1.5) * 3) / 3 * 0.13
          if (lv <= 0) continue
          if (fb[y * W + x] !== forestBuf[y * W + x]) continue
          if (isSolidKind(tileAt(world0, Math.floor((x + cx) / TILE), ty))) continue
          addLight(x, y, P.ye3, lv)
        }
      }
    }
  }



  // 天の空の雲（三段、ゆっくり流れる。ふわふわの塊）
  const drawClouds = (camX, camY, t) => {
    for (let layer = 0; layer < 3; layer++) {
      const sp = 0.15 + layer * 0.15, y0 = 40 + layer * 50
      for (let i = -1; i < 8; i++) {
        const cx = Math.round(((i * 70 + hash(i, layer, 80) * 40 - camX * sp - t * (3 + layer * 2)) % 560 + 560) % 560) - 80, cy = y0 + Math.floor(hash(i, layer, 81) * 30)
        const r = 8 + Math.floor(hash(i, layer, 82) * 8)
        for (let k = -2; k <= 2; k++) for (let j = -r; j <= r; j++) for (let ii = -r; ii <= r; ii++) {
          if (ii * ii + j * j > r * r || j > r * 0.4) continue
          px(cx + k * r * 0.8 + ii, cy + j + Math.abs(k) * 3, j > r * 0.1 ? (layer === 2 ? P.gy6 : P.bl5) : P.white)
        }
      }
    }
  }

  // 天の背景（2026-11-10）: Pixel の deva/sky。天は一画面でカメラが動かないので、画面にそのまま置く。絵が無ければ false（帯とコードの雲のまま）
  //   空は水色一色（下絵の sky はやめた。本人の頼み）。その上に、帝釈天の宮殿 palace と小さな雲 cloud を置き、clouds（左右がつながる雲の帯）を流す。
  //   palace・cloud が無いうちは、前の下絵 sky を一枚そのまま
  // 流す雲の帯（奥から順に描く）: y は帯の上の端、speed は 1 秒に何ドット流れるか、shift は絵をどれだけ横にずらすか（帯ごとに形がそろわないように）
  //   一本目は前の下絵の上の雲の帯と同じ高さ（2026-11-10 に本人の頼みで 40 から下げた）。そこから 10 ドットずつ下へ、画面の下まで帯を重ねて、下を全部雲で覆う
  //   （本人の頼み。帯の絵は上の 6 行がでこぼこで透け、その下の 12 行は詰まっているので、10 ドットずつなら隙間なく覆える）。下の帯ほど手前なので、少しずつ速く
  const DEVA_CLOUDS = Array.from({ length: 16 }, (_, k) => ({ y: 84 + k * 10, speed: 4 + k * 0.8, shift: (k * 137) % 320 }))
  // 宮殿と小さな雲の置き場所（左上の角。前の下絵にあった場所）。小さな雲は、ごくゆっくり右へ流れ、右の端から出たら左から入る
  const DEVA_PALACE = { x: 222, y: 24 }, DEVA_PUFFS = [{ x: 21, y: 14, speed: 1.2 }, { x: 281, y: 30, speed: 0.8 }, { x: 141, y: 56, speed: 1.6 }]
  const blitDeva = (a, rows, x0, y0) => { for (let j = 0; j < rows.length; j++) { const y = y0 + j; if (y < 0 || y >= H) continue; const row = rows[j]; for (let i = 0; i < row.length; i++) { const x = x0 + i; if (x < 0 || x >= W) continue; const ch = row[i]; if (ch === '.' || a.colors[ch] == null) continue; px(x, y, a.colors[ch]) } } }
  const drawDevaSky = (t) => {
    const a = ART['deva/sky'], pics = a?.pics
    if (!pics) return false
    if (pics.palace || pics.cloud) {
      for (let i = 0; i < W * H; i++) fb[i] = P.bl5
      if (pics.cloud) { const w = pics.cloud[0].length; for (const c of DEVA_PUFFS) { const x = Math.round((((c.x + t * c.speed + w) % (W + w)) + (W + w)) % (W + w)) - w; blitDeva(a, pics.cloud, x, c.y) } }
      if (pics.palace) blitDeva(a, pics.palace, DEVA_PALACE.x, DEVA_PALACE.y)
    } else if (pics.sky) {
      for (let y = 0; y < Math.min(H, pics.sky.length); y++) { const row = pics.sky[y]; for (let x = 0; x < W; x++) { const c = a.colors[row[x]]; if (c != null) fb[y * W + x] = c } }
    } else return false
    const cl = pics.clouds
    if (cl) for (const band of DEVA_CLOUDS) {
      const w = cl[0].length, off = (Math.floor(t * band.speed) + band.shift) % w
      for (let j = 0; j < cl.length; j++) { const y = band.y + j; if (y < 0 || y >= H) continue; const row = cl[j]; for (let x = 0; x < W; x++) { const ch = row[(x + off) % w]; if (ch === '.' || a.colors[ch] == null) continue; px(x, y, a.colors[ch]) } }
    }
    return true
  }

  // 空と背景の飾りを描く（岩のタイルより奥）。lit: いる光の部屋を、満ちた光の色で描く。地獄の空なら true を返す
  const drawSky = (world, lit, camX, camY, t) => {
    // 背景: 上は闇、下ほど炎の照り返しで赤く。境目は市松でぼかす
    const animal = world.realm === 'animal', peta = world.realm === 'peta', human = world.realm === 'human', deva = world.realm === 'deva', last = !!realmOf(world).sections
    // 畜生: 明るい昼下がりの森（drawForestSky。満ちた光の部屋は下でまとめて塗る）。餓鬼: 昼の町。明るい空、遠くに家並み
    // 人: 川辺から霊鷲山への道（src/render/village.js）
    // 天: 淡い桃と空色の空に、流れる雲
    // 再び人: 色を失った、淡い灰色の空
    const bands = last ? [[0, P.gy5], [100, P.gy6], [165, P.gy5]] : deva ? [[0, P.bl4], [90, P.bl5], [160, P.pk3]] : human ? [[0, P.bl5], [110, P.ye3], [165, P.gr6]] : peta ? [[0, P.bl4], [100, P.bl5], [165, P.gy6]] : [[0, P.black], [100, P.pu0], [150, P.rd0]]
    const hell = !animal && !peta && !human && !deva && !last && !lit
    if (hell) drawHellSky(camX, camY, t)
    else if (animal && !lit) drawForestSky(camX, camY, t)
    else if (peta && !lit) town.drawTownSky(world, camX, camY, t)
    else if (human && !lit) village.drawVillageSky(world, camX, camY, t)
    else if (deva && !lit && drawDevaSky(t)) { /* Pixel の天の背景 */ }
    else for (let y = 0; y < H; y++) {
      let c = P.black, c2 = null
      for (let k = 0; k < bands.length; k++) {
        if (y >= bands[k][0]) c = bands[k][1]
        if (k + 1 < bands.length && y >= bands[k + 1][0] - 12 && y < bands[k + 1][0]) c2 = bands[k + 1][1]
      }
      for (let x = 0; x < W; x++) fb[y * W + x] = c2 != null && (x + y) % 2 === 0 ? c2 : c
    }
    // 地獄は燃えカス（2026-11-06）: ゆっくり落ちながら左右にふらふら揺れ、ときどき一瞬だけ橙・黄に光る（光った瞬間は光の層に小さな輝き）。
    //   落ちる速さ・揺れ・瞬く間合いは一粒ずつばらばら。速いものはカメラによくついて来て手前に、遅いものは奥に見える。
    //   噴火口の火の粉は上へ昇るので、背景の燃えカスは下へ落ちる（向きで見分ける）。光るのは一度に数粒、ほんの一瞬
    if (hell) for (let i = 0; i < 40; i++) {
      const near = hash(i, 9), par = 0.15 + near * 0.3, vy = 4 + near * 12
      const amp = 1.5 + hash(i, 10) * 3, f = 0.6 + hash(i, 11) * 0.9
      const x = Math.floor(((hash(i, 7) * 2000 + Math.sin(t * f + i) * amp - camX * par) % W + W) % W)
      const y = Math.floor(((hash(i, 8) * 400 + t * vy - camY * par) % H + H) % H)
      const period = 2.5 + hash(i, 12) * 4, ph = (t / period + hash(i, 13)) % 1
      const c = ph < 0.025 ? P.ye3 : ph < 0.05 ? P.ye2 : ph < 0.08 ? P.or2 : near < 0.35 ? P.rd0 : P.rd1
      px(x, y, c)
      if (ph < 0.05 && !isSolidKind(tileAt(world, Math.floor((x + camX) / TILE), Math.floor((y + camY) / TILE)))) {
        const a = ph < 0.025 ? 0.5 : 0.3
        addLight(x, y, P.or2, a); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) addLight(x + dx, y + dy, P.or2, a * 0.4)
      }
    }
    // 畜生は綿毛（2026-11-06 に蛍から替えた。昼の森）: ゆっくり上へ漂いながら左右に揺れ、ときどき日を受けてきらっと光る。
    //   速さ・揺れ・きらめく間合いは一粒ずつばらばら。速いものはカメラによくついて来て手前に、遅いものは奥に見える
    if (animal && !lit) for (let i = 0; i < 36; i++) {
      const near = hash(i, 19), par = 0.15 + near * 0.3, vy = 3 + near * 7, vx = 2 + hash(i, 23) * 4
      const amp = 2 + hash(i, 20) * 4, f = 0.5 + hash(i, 21) * 0.8
      const x = Math.floor(((hash(i, 17) * 2000 + t * vx + Math.sin(t * f + i) * amp - camX * par) % W + W) % W)
      const y = Math.floor(((hash(i, 18) * 400 - t * vy - camY * par) % H + H) % H)
      const period = 3 + hash(i, 22) * 4, ph = (t / period + hash(i, 24)) % 1
      px(x, y, ph < 0.04 ? P.white : near < 0.4 ? P.sa3 : P.bg2)
      if (ph < 0.04 && !isSolidKind(tileAt(world, Math.floor((x + camX) / TILE), Math.floor((y + camY) / TILE)))) {
        addLight(x, y, P.ye3, 0.35); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) addLight(x + dx, y + dy, P.ye3, 0.12)
      }
    }
    if (deva && !ART['deva/sky']?.pics) drawClouds(camX, camY, t)   // Pixel の天の背景があれば、雲は絵の clouds
    // 光の部屋（満ちたとき）: 背景は白く明るい
    if (lit && deva) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fb[y * W + x] = (x + y) % 2 ? P.white : P.ye3
    else if (lit && human) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fb[y * W + x] = y < 70 ? ((x + y) % 2 && y > 58 ? P.ye3 : P.white) : y < 150 ? ((x + y) % 2 && y > 138 ? P.sa3 : P.ye3) : P.sa3   // 人: 朝の金色の光
    else if (lit && peta) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fb[y * W + x] = y < 70 ? ((x + y) % 2 && y > 58 ? P.ye3 : P.white) : y < 150 ? ((x + y) % 2 && y > 138 ? P.pk3 : P.ye3) : P.pk3   // 餓鬼: 温かな光
    else if (lit && animal) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fb[y * W + x] = y < 70 ? ((x + y) % 2 && y > 58 ? P.ye3 : P.white) : y < 150 ? ((x + y) % 2 && y > 138 ? P.gr6 : P.ye3) : P.gr6   // 畜生: 柔らかな金色の光
    else if (lit) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fb[y * W + x] = y < 70 ? ((x + y) % 2 && y > 58 ? P.bl5 : P.white) : y < 150 ? ((x + y) % 2 && y > 138 ? P.tl3 : P.bl5) : P.tl3
    return hell
  }

  return { drawSky, hellGlow, forestGlow }
}
