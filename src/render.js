// 描画: 色の番号の画面（fb, 320x240）に描く。DOM は使わない
//   中身は src/render/ に分けてある: base（共通の道具）、sky（背景）、tiles（地面）、effects（効果）、things（住人と物）、ui（窓と文字）。
//   ここには、画面・光の層・文字・絵を写す道具と、全部を順に描く draw が入っている
import { P } from './palette.js'
import { ART } from './art.js'
import { TILE, signShown, signOffsets } from './world.js'
import { TRAY, GIFT_BACK } from './game.js'
const END_DARK = 4   // 最後の道: 終わりの部屋の入口の何マス手前から暗みはじめるか（2026-11-07 に 24・2 マスを試して 4 マス）
import { glyph, textWidth, eachDot, FONT_H } from './glyph.js'
import { W, H, hash, RGB, realmOf, dither } from './render/base.js'
import { makeSky } from './render/sky.js'
import { makeTiles } from './render/tiles.js'
import { makeEffects } from './render/effects.js'
import { makeThings } from './render/things.js'
import { makeUi } from './render/ui.js'
import { makeWind } from './render/wind.js'
import { makeDonor } from './render/donor.js'

export { W, H }

export function createRenderer(fb) {
  let turn = null   // 花を回して描く間だけ: 描く点を回す関数（天井・壁の針から咲く花。turnAround）
  const px = (x, y, c) => { if (turn) [x, y] = turn(x, y); if (x >= 0 && y >= 0 && x < W && y < H) { const o = y * W + x; fb[o] = c; if (tintOn) tintA[o] = 0 } }   // 上に描いた点は、その下の半透明を隠す
  // 半透明: 下の色と c を a の割合で混ぜた色に、いちばん近い色（色の表と、その暗い色の中から）。混ぜる計算は拡大する前の画面の上で（pixelfx の考え方。ref/pixelfx-ideas.md）
  const mixCache = new Map()
  const mixed = (bg, c, a) => {
    const key = (bg * 512 + c) * 16 + Math.round(a * 15)
    let v = mixCache.get(key)
    if (v == null) {
      const A = RGB[bg], B = RGB[c], m = [0, 1, 2].map((k) => A[k] * (1 - a) + B[k] * a)
      let best = 0, bd = 1e9
      RGB.forEach((q, i) => { const d = (q[0] - m[0]) ** 2 + (q[1] - m[1]) ** 2 + (q[2] - m[2]) ** 2; if (d < bd) { bd = d; best = i } })
      mixCache.set(key, (v = best))
    }
    return v
  }
  const blend = (x, y, c, a) => { if (x >= 0 && y >= 0 && x < W && y < H) { const o = y * W + x; fb[o] = mixed(fb[o], c, a); if (tintOn) tintA[o] = 0 } }
  // 本当の半透明の層（2026-11-07。パレットに縛られない。~/src/etc の決まり）: 色の番号の画面とは別に、色（RGB）と濃さを持ち、present で画面の色と混ぜる。
  //   あとから px・blend で描いた点は、その下の半透明を隠す。画面全体を書き換える効果（死・看板の窓・終わり）の前には bakeTint で画面に焼き込む
  //   （焼き込むと、パレットのいちばん近い色に丸まる）。濃さは呼ぶ側で段に刻む
  const tintRGB = new Float32Array(W * H * 3), tintA = new Float32Array(W * H)
  let tintOn = false
  const tint = (x, y, c, a) => {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return
    const o = y * W + x, A = tintA[o], q = RGB[c], na = a + A * (1 - a), w0 = (A * (1 - a)) / na, w1 = a / na
    tintRGB[o * 3] = tintRGB[o * 3] * w0 + q[0] * w1; tintRGB[o * 3 + 1] = tintRGB[o * 3 + 1] * w0 + q[1] * w1; tintRGB[o * 3 + 2] = tintRGB[o * 3 + 2] * w0 + q[2] * w1
    tintA[o] = na; tintOn = true
  }
  const bakeTint = () => {
    if (!tintOn) return
    for (let o = 0; o < W * H; o++) {
      const a = tintA[o]
      if (a <= 0) continue
      const A = RGB[fb[o]], m = [0, 1, 2].map((k) => A[k] * (1 - a) + tintRGB[o * 3 + k] * a)
      let best = 0, bd = 1e9
      RGB.forEach((q, i) => { const d = (q[0] - m[0]) ** 2 + (q[1] - m[1]) ** 2 + (q[2] - m[2]) ** 2; if (d < bd) { bd = d; best = i } })
      fb[o] = best
    }
    tintA.fill(0); tintOn = false
  }
  // 光の層（パレットに縛られない。~/src/etc の決まり）: 色の番号の画面とは別に、足す光を RGB で持つ。最後に main.js が画面の色に足す
  //   光の強さは呼ぶ側で段に刻む（なめらかな階調にしない）。毎コマ、使ったときだけ消す
  const lightBuf = new Float32Array(W * H * 3)
  let lightUsed = false
  const addLight = (x, y, c, a) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const i = (y * W + x) * 3, q = RGB[c]
    lightBuf[i] += q[0] * a; lightBuf[i + 1] += q[1] * a; lightBuf[i + 2] += q[2] * a
    lightUsed = true
  }
  // Pixel の絵（src/art.js）。文字ごとの色を引いて描く。letterMap で文字ごとに色を替えられる
  const artPic = (ref, name) => { const a = ART[ref]; return a && a.pics[name] ? { rows: a.pics[name], colors: a.colors, anims: a.anims } : null }
  const artBlit = (pic, x, y, flip, letterMap, all) => {
    const rows = pic.rows, h = rows.length, w = rows[0].length
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const ch = rows[j][flip ? w - 1 - i : i]
      if (ch === '.') continue
      px(x + i, y + j, all ?? letterMap?.[ch] ?? pic.colors[ch])
    }
  }
  // 動き（anim の行）のコマを、経った秒から選ぶ
  const animFrame = (ref, anim, sec) => {
    const a = ART[ref]?.anims?.[anim]
    if (!a) return null
    const total = a.ms.reduce((x, y) => x + y, 0)
    let t = (sec * 1000) % total
    for (let k = 0; k < a.frames.length; k++) { if (t < a.ms[k]) return a.frames[k]; t -= a.ms[k] }
    return a.frames[0]
  }

  // 文字（src/glyph.js。字の大きさは art/font.json）
  const textW = (s) => textWidth(s)
  //   縁取り: 背景と混ざらないように、字のまわり 1 ドットを shadow の色で囲む（上下左右と斜め。右下は影として 2 ドット）。縁を全部描いてから字を描く
  const RIM = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [2, 2], [1, 2], [2, 1]]
  const text = (x, y, s, c, shadow = P.black) => {
    for (const pass of shadow != null ? [0, 1] : [1]) {
      let cx = x | 0
      for (const ch of s) {
        const g = glyph(ch)
        if (g) eachDot(g, (i, j) => { if (pass) px(cx + i, y + j, c); else for (const [dx, dy] of RIM) px(cx + i + dx, y + j + dy, shadow) })
        cx += g?.w ?? (FONT_H >> 1)
      }
    }
  }

  const ctx = { fb, px, blend, tint, bakeTint, addLight, light: lightBuf, lightUsed: () => lightUsed, artPic, artBlit, animFrame, text, textW, setTurn: (f) => { turn = f } }
  const sky = makeSky(ctx), tiles = makeTiles(ctx), effects = makeEffects(ctx), things = makeThings(ctx), ui = makeUi(ctx), wind = makeWind(ctx), donor = makeDonor(ctx)

  // プレイヤー: 足あと・汗・鬼火・土ぼこり、体（ダッシュ中は白く、天では飛ぶ姿）、運んでいる施す食べ物
  const drawPlayer = (S, p, camX, camY, t) => {
    const world = S.world, ref = realmOf(world).player
    for (const tr of p.trail) {
      if (Math.floor(tr.t * 60) % 2) continue
      const c = tr.t < 0.1 ? P.bl3 : P.bl1
      const jp = artPic(ref, 'jump')
      if (jp) artBlit(jp, Math.round(tr.x - camX - 8), Math.round(tr.y - camY - 16), tr.dir < 0, null, c)
    }
    // 汗のしずく（よじ登るとき）
    //   鬼火（青、ゆらゆら昇る）と見分けがつくように、水の色。1 ドットの粒で、白く光ってから青緑になって消える
    for (const d of p.drops) px(Math.round(d.x - camX), Math.round(d.y - camY), d.t < d.life * 0.5 ? P.white : P.tl3)
    for (const w of p.wisps) effects.drawWisp(w, camX, camY)
    for (const k of p.puffs || []) effects.drawPuff(k, camX, camY)
    const sx = Math.round(p.x - camX - 8)
    const sy = Math.round(p.y - camY - 16) + (p.landT > 0.05 ? 1 : 0)
    const moving = Math.abs(p.vx) > 5
    // 天では、空中は跳ぶ絵ではなく飛ぶ絵（Pixel の fly）
    const flying = realmOf(world).sky && !p.onGround && !p.climb
    const fname = p.climb ? 'climb' : flying ? (animFrame(ref, 'fly', t) || 'jump') : !p.onGround ? 'jump' : moving ? (animFrame(ref, 'run', p.anim) || 'run1') : 'stand'
    const pic = artPic(ref, fname) || artPic(ref, 'stand')
    const white = p.dash > 0 && p.dashFx === 2   // ダッシュ中は体が白く光る（一段目は光らない）
    if (pic) artBlit(pic, sx, sy, p.dir < 0, null, white ? P.white : undefined)   // ダッシュを使い切っても色は変えない（2026-11-08 に、体が青くなる合図をやめた。2 回で尽きるのは分かりきっていて、人と餓鬼では服の色が変わって見えたため）
    // 人の道: 運んでいる施す食べ物を、頭の上に
    if (S.carry != null) things.drawCarried(S, camX, camY, TRAY.shake)   // 頭の上の器と乳粥（傾きは src/game.js の TRAY）
  }

  return {
    // hud: false なら、生の数や部屋の名前を出さない。S.player が null なら体を描かない（エディタ）
    light: lightBuf, lightUsed: () => lightUsed,
    // 色の番号の画面（fb）に光の層を足して、RGBA の Uint32 の画面（out32）に書く。PAL32 は色の番号 → RGBA の表。
    //   withLight が false なら光の層は使わない（ゲーム以外の画面。前のコマの光が残っているので）
    present(out32, PAL32, withLight = true) {
      if (withLight && (lightUsed || tintOn)) {
        const L = lightBuf
        for (let i = 0; i < W * H; i++) {
          const c = PAL32[fb[i]], a = tintOn ? tintA[i] : 0
          let r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255
          if (a > 0) { r += (tintRGB[i * 3] - r) * a; g += (tintRGB[i * 3 + 1] - g) * a; b += (tintRGB[i * 3 + 2] - b) * a }   // 半透明を混ぜてから、光を足す
          if (lightUsed) { r += L[i * 3]; g += L[i * 3 + 1]; b += L[i * 3 + 2] }
          out32[i] = 0xff000000 | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r)
        }
      } else for (let i = 0; i < W * H; i++) out32[i] = PAL32[fb[i]]
    },
    // 看板の窓だけを描く（タイトルの看板の一覧から開くとき）: S は { reading: { id, t, close }, touchUi }
    drawSignWindow: (S, t) => ui.drawReading(S, t),
    // 画面のドット (x, y) が、看板の窓の「原典を開く」の上か
    onSignLink: ui.onSignLink,
    draw(S, t, { hud = true } = {}) {
      if (lightUsed) { lightBuf.fill(0); lightUsed = false }
      if (tintOn) { tintA.fill(0); tintOn = false }
      const world = S.world, p = S.player
      const camX = S.cam.x, camY = S.cam.y
      tiles.setBloodFrom(p && !S.dead ? { x: p.x, y: p.y - 8 } : S.dead ? { x: S.dead.x, y: S.dead.y } : null)
      // 背景と岩。lit: いる光の部屋を、満ちた光の色で描く
      const drawBase = (lit) => {
        const hell = sky.drawSky(world, lit, camX, camY, t)
        tiles.drawTiles(world, S, lit, camX, camY, t)
        if (hell) sky.hellGlow(world, camX, camY, t)
        else if (world.realm === 'animal' && !lit) sky.forestGlow(world, camX, camY, t)
      }
      // 光の部屋: 地獄の者に近づくほど（S.light 0〜1）、自分のまわりから光が広がる（円の中だけ光の色。縁は市松でぼかす）。満ちると部屋じゅう
      const light = S.room?.light ? S.light ?? 0 : 0
      const lightLv = Math.round(light * 4)
      if (light <= 0.01 || light >= 0.99) drawBase(light >= 0.99)
      else {
        drawBase(false)
        const dark0 = fb.slice()
        drawBase(true)
        const ox = p ? p.x - camX : W / 2, oy = p ? p.y - 8 - camY : H / 2
        const R = 12 + light * light * 340, band = 6
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const d = Math.hypot(x - ox, y - oy) - R
          if (d > band || (d > 0 && !dither(x, y, d < band / 3 ? 3 : d < (band * 2) / 3 ? 2 : 1))) fb[y * W + x] = dark0[y * W + x]
        }
      }
      // 再び人: 景色は色を失う（このあとに描く花・誘うもの・プレイヤーだけに色が残る）
      if (realmOf(world).sections) tiles.grayScreen()
      // 光の部屋の地獄の者
      things.drawSeat(S, p, lightLv, camX, camY, t)
      // 光の部屋の塵（ゆっくり昇る。満ちてから）
      if (lightLv >= 4) for (let i = 0; i < 40; i++) { const x = Math.floor(hash(i, 31) * W), y = Math.floor(((hash(i, 32) * H - S.time * (6 + hash(i, 33) * 8)) % H + H) % H); px(x, y, i % 3 ? P.white : P.ye3) }
      effects.drawBlessing(S, world, camX, camY)   // 見つけた光の部屋の、祝福の花びら
      for (const j of world.jets) { const sx = j.x * TILE - camX, sy = j.y * TILE - camY; if (sx > -20 && sx < W + 20) effects.drawJet(j, sx, sy, S.time) }
      for (const c of world.creatures || []) things.drawCreature(c, camX, camY, S.time)
      for (const g of world.signs || []) if (signShown(world, g)) {   // 岩の中の看板は、崩れてから
        // 再び人: 継ぎ目の近くの看板は、継ぎ目の向こうの写しにも描く（花・誘うものと同じ。2026-11-07。一周して戻ったとき、看板が消えてから出て見えた）。写しも読める（src/world.js の signOffsets）
        for (const off of signOffsets(world, g)) things.drawSign(off ? { ...g, x: g.x + off, off } : g, camX, camY, S, t)
      }
      // 餓鬼の道: 食べ物、町の人、供養の人
      for (const f of world.foods || []) things.drawFood(f, camX, camY, S)
      for (const f of world.folk || []) things.drawFolk(f, camX, camY, S.folkClock?.[f.index] ?? S.time, S.folkLook?.[f.index] > 0 && p ? p : null, S.folkSeed)   // 人の道: 町の人ごとの時計、見ているときはこちらを向いて立ち止まる
      if (S.donors?.length) donor.drawDonors(S, camX, camY)   // 餓鬼の道の布施人
      if (S.room?.light && S.room.offer && realmOf(world).light === 'offering') things.drawOffering(S.room, camX, camY, S)
      // 人の道: 施す食べ物（拾う前のもの）と、托鉢の僧
      if (S.rain) things.drawRain(S, camX, camY, t)
      for (const g of world.gifts || []) {
        if (S.given?.has(g.index) || S.carry === g.index) continue
        // こぼしたあと: GIFT_BACK 秒は無く、そのあと 0.4 秒でぽつぽつと現れ、湯気が立つ（src/game.js の GIFT_BACK）
        const age = S.giftGone?.has(g.index) ? S.time - S.giftGone.get(g.index) - GIFT_BACK : 9
        if (age < 0) continue
        things.drawGift(g.index, Math.round(g.x - camX), Math.round(g.y - camY), Math.min(1, age / 0.4), age < 1.6 ? age : null)
      }
      // こぼれた乳粥（人の道。2026-11-08）: 粒が塊で飛び出して床に落ち、またたいて消える（src/porridge.js）
      if (S.porridge?.free) things.drawPorridge(S.porridge, camX, camY)
      if (S.porridge) things.drawDrops(S.porridge, camX, camY)   // 縁からこぼれた粒
      if (S.rocks) things.drawRocks(S, world, camX, camY, t)   // 人の道の転がる岩
      if (S.fallBowl) things.drawBowl(Math.round(S.fallBowl.x - camX), Math.round(S.fallBowl.y - camY), S.fallBowl.a)   // こぼれて落ちていく器（src/game.js）
      if (S.room?.light && S.room.seat && realmOf(world).light === 'alms') things.drawMonk(S.room, camX, camY, S, p)
      // 再び人の道の終わり（解脱の手前）: 終わりの部屋（end）に近づくほど、右へ黒く暗む（火が吹き消えるように。経集 5.7。半透明の黒を 8 段に刻む）。
      //   2026-11-08 に、白く明るむ（光の層、最大 0.7）から変えた。終わりの部屋の入口で真っ黒になり、終わりの画面はそこから浮かび上がる。
      //   これまで咲かせたカーネーションとプレイヤーは、この上に描くので暗まない（闇の中に自分と花だけが残る）
      if (world.loop && !S.ending) {
        const endRoom = world.rooms.find((r) => r.end)
        if (endRoom) {
          const ex = endRoom.x * TILE, span = END_DARK * TILE
          for (let x = 0; x < W; x++) {
            const k = (x + camX - (ex - span)) / span
            if (k <= 0) continue
            const a = Math.ceil(Math.min(1, k) * 8) / 8   // 8 段に刻む
            for (let y = 0; y < H; y++) tint(x, y, P.black, a)
          }
        }
      }
      effects.drawMemories(S, world, camX, camY)
      if (S.loopRun) things.drawTempts(world, S, camX, camY, t)
      effects.drawFlowers(S, world, camX, camY)
      tiles.drawSpikesFront(world, camX, camY, t)
      effects.drawPetals(S, camX, camY)
      if (S.bloom && S.bloom.t >= 0) effects.drawBloom(S.bloom, camX, camY)
      if (S.winds?.length) wind.drawWinds(S, camX, camY, S.time)   // 餓鬼の道の熱い風（体の後ろ）
      if (!S.dead && p) drawPlayer(S, p, camX, camY, t)
      else if (S.dead) { effects.drawJaws(S, camX, camY); bakeTint(); ui.drawDeath(S, p, t) }   // 暗くなる効果の前に、半透明を画面に焼き込む
      if (S.discover) effects.drawDiscover(S.discover, camX, camY)
      // すり抜けの岩が開いた瞬間（src/game.js の crumble）
      if (S.reveal) effects.drawCrumble(S.reveal, camX, camY)
      effects.drawRevealFlash(S.reveal)
      effects.shakeScreen(S.reveal)
      // 解脱: 黒から背景の絵が浮かび上がり、終わりの言葉と、これまでの生と花の数（そのセーブは見るだけ）
      if (S.ending) { bakeTint(); ui.drawEnding(S); return }
      // 文字
      if (!hud) return
      ui.drawHud(S, lightLv, t)
      if (S.reading) { bakeTint(); ui.drawReading(S, t) }
    },
  }
}
