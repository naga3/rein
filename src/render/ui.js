// 窓と文字: 看板の窓、死の間際の光の列、解脱の終わりの画面、画面の隅の文字（生の数・場所・見出し）
import { P } from '../palette.js'
import { dark } from '../shade.js'
import { SIGNS } from '../signs.js'
import { DEAD_TIME, DEATH_HOLD, SIGN_OPEN, SIGN_CLOSE } from '../game.js'
import { ART } from '../art.js'
import { tr, LANG, roomName } from '../i18n.js'
import { ESCAPE, ENDING_BACK } from '../realms.js'
import { W, H, hash, realmOf } from './base.js'

export function makeUi({ fb, px, addLight, tint, light, lightUsed, text, textW, artPic, artBlit }) {
  // 見つけた光の列（死の間際。2026-11-05）: その道の光の部屋（にあたるもの）の数だけ玉を並べる。見つけた分は灯り、この生で見つけた分は下から昇って来て灯る。
  //   ESCAPE 個目までを金の線で下から支え、その先に区切りを置く（ESCAPE 個で抜けられ、全部で何個あるかが見える）。字の説明は出さない
  //   段取り（ref/pixelfx-ideas.md）: 列が現れる → 新しい光が一つずつ昇る（速く出て、ゆっくり着く）→ 着いた瞬間に白い決めのコマと光 → 残る
  const drawLightRow = (S, k, t) => {
    const total = S.world.rooms.filter((q) => q.light).length
    if (!total) return
    const found = Math.min(total, S.found.size), fresh = Math.min(found, S.foundThisLife || 0), old = found - fresh
    const GAP = 13, SPLIT = 9, rowW = (total - 1) * GAP + (total > ESCAPE ? SPLIT : 0)
    const x0 = Math.round((W - rowW) / 2), y = 124
    const xs = (i) => x0 + i * GAP + (i >= ESCAPE ? SPLIT : 0)
    const appear = Math.min(1, (k - 0.62) / 0.12)
    if (appear <= 0) return
    // 抜けるまでの線（金）と区切り
    const lineW = Math.round(((ESCAPE - 1) * GAP + 8) * appear)
    for (let x = 0; x < lineW; x++) px(xs(0) - 4 + x, y + 7, P.ye3)
    if (total > ESCAPE) for (let j = -5; j <= 7; j++) if (j % 2 === 0) px(xs(ESCAPE - 1) + Math.round((GAP + SPLIT) / 2), y + j, P.gy4)
    const orb = (cx, cy, lit, flash) => {
      if (!lit) {   // まだ見つけていない: 暗い輪
        for (const [a, b] of [[-2, -1], [-2, 0], [-2, 1], [2, -1], [2, 0], [2, 1], [-1, -2], [0, -2], [1, -2], [-1, 2], [0, 2], [1, 2]]) px(cx + a, cy + b, P.gy3)
        return
      }
      for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) if (a * a + b * b <= 5) px(cx + a, cy + b, a * a + b * b <= 1 ? P.white : flash ? P.white : P.bl5)
      for (let b = -6; b <= 6; b++) for (let a = -6; a <= 6; a++) { const d = a * a + b * b; if (d <= 36) addLight(cx + a, cy + b, P.bl5, (d <= 9 ? 0.5 : d <= 20 ? 0.3 : 0.15) * (flash ? 2 : 1)) }
    }
    for (let i = 0; i < total; i++) {
      if (i < old) { orb(xs(i), y, true, false); continue }
      if (i >= found) { orb(xs(i), y, false, false); continue }
      // この生で見つけた光: 一つずつ、画面の下から昇って来る
      const n = i - old, t0 = 0.72 + n * 0.12, e = (k - t0) / 0.22
      orb(xs(i), y, false, false)
      if (e <= 0) continue
      const q = Math.min(1, e), ease = 1 - (1 - q) ** 3
      const cy = Math.round(H + 8 + (y - H - 8) * ease)
      if (q < 1) {
        orb(xs(i), cy, true, false)
        for (let j = 1; j <= 6; j++) if (cy + j * 3 < H) px(xs(i), cy + j * 3, j < 3 ? P.bl5 : P.bl4)   // 尾
      } else orb(xs(i), y, true, e < 1.25)   // 着いた瞬間は白く光る
    }
    // あといくつで抜けるかは、字では出さない（玉と金の線から読み取らせる。2026-11-05）
  }


  // 看板の窓: 開くとき、真ん中の白い一本の線から上下へさっと広がり（決めのコマ）、言葉が上から一行ずつ現れる。閉じるときは、言葉が消えて、線へ縮んで消える
  let signLinkBox = null   // 看板の窓の「原典を開く」の当たり [左, 上, 右, 下]（画面のドット。窓が開ききっている間だけ）
  const drawReading = (S, t) => {
    const R = S.reading, sign = SIGNS[R.id]
    if (!sign) return
    const L = sign[LANG] || sign.ja
    // 窓の下の案内（スマホと PC で、それぞれの操作だけ）。終わりの「原典を開く」は下線つきのリンクで、そこをクリック・タップすると原典を開く（2026-11-06。ほかの所のクリック・タップは閉じる）
    const keysHint = (S.touchUi ? tr.signKeysTouch : tr.signKeys) + tr.signLink
    // 行の頭が @ の行は、その上のまとまりの出典（右寄せ、出典の色）。二つの経を一枚に載せるとき、まとまりごとに出典を書く（2026-11-10。増支部 1.49・1.50 など）。
    //   そのときは、下の出典（L.source）は窓に出さない（看板の一覧の名前には使う）
    const lines = L.lines, LH = 14, isSrc = (m) => m.startsWith('@'), inline = lines.some(isSrc), bare = (m) => isSrc(m) ? m.slice(1) : m
    const tw = Math.max(...lines.map((m) => textW(bare(m))), inline ? 0 : textW(L.source))
    const bw = Math.min(W - 8, Math.max(tw, textW(keysHint)) + 24), bh = lines.length * LH + (inline ? 38 : 52)
    const bx = (W - bw) >> 1, by = (H - bh) >> 1, cy = by + (bh >> 1)
    const open = Math.min(1, R.t / SIGN_OPEN), shut = R.close != null ? Math.min(1, R.close / SIGN_CLOSE) : 0
    const k = open < 1 ? 1 - (1 - open) ** 3 : 1 - shut * shut
    const hh = Math.max(1, Math.round((bh / 2) * k))
    // 後ろを少し暗く（市松に暗い点を置く）
    const dim = Math.round(2 * k)
    if (dim) for (let y = 0; y < H; y++) for (let x = (y & 1); x < W; x += 2) if (dim > 1 || (x + y) % 4 === 0) fb[y * W + x] = P.black
    // 窓の中には光の層を足さない（背景の燃えカスや炎の光が、窓の上に透けて出ていた。2026-11-06）
    if (lightUsed()) for (let y = Math.max(0, cy - hh); y < Math.min(H, cy + hh); y++) light.fill(0, (y * W + Math.max(0, bx)) * 3, (y * W + Math.min(W, bx + bw)) * 3)
    for (let y = cy - hh; y < cy + hh; y++) for (let x = bx; x < bx + bw; x++) {
      const edge = y === cy - hh || y === cy + hh - 1 || x === bx || x === bx + bw - 1
      const inner = y === cy - hh + 2 || y === cy + hh - 3 || x === bx + 2 || x === bx + bw - 3
      px(x, y, edge ? (open < 1 || shut > 0.8 ? P.white : P.gy4) : inner && hh > 4 ? P.br2 : P.ink)
    }
    signLinkBox = null
    if (open < 1 || shut > 0) return
    // 言葉: 一行ずつ（0.035 秒おき）。出典は下に小さく暗く
    lines.forEach((m, i) => { if (R.t - SIGN_OPEN > i * 0.035) { if (isSrc(m)) text(bx + bw - 12 - textW(bare(m)), by + 12 + i * LH, bare(m), P.br4, P.black); else text(bx + 12, by + 12 + i * LH, m, P.gy6, P.black) } })
    if (R.t - SIGN_OPEN > lines.length * 0.035) {
      if (!inline) text(bx + bw - 12 - textW(L.source), by + bh - 34, L.source, P.br4, P.black)
      // 窓の下の端に、ボタンの案内（決定で原典を開く・キャンセルで閉じる）
      for (let x = bx + 8; x < bx + bw - 8; x += 2) px(x, by + bh - 21, P.gy2)
      const hx = (W - textW(keysHint)) >> 1, hy = by + bh - 17, pre = keysHint.slice(0, keysHint.length - tr.signLink.length), lx = hx + textW(pre), lw = textW(tr.signLink)
      text(hx, hy, pre, P.gy4, P.black)
      text(lx, hy, tr.signLink, P.bl4, P.black)
      for (let x = lx; x < lx + lw; x++) px(x, hy + 13, P.bl4)
      signLinkBox = [lx - 3, hy - 3, lx + lw + 3, hy + 16]
      // 初めて読んだときの、出典の横の小さな光は消した（2026-11-06。意味が伝わりにくく、初めて読んだことは看板の根もとに咲く花で分かる）
    }
  }

  // 解脱の終わりの画面: 真っ黒（道の終わりの暗み）から、2 秒かけて背景の絵 ending/bg が浮かび上がり（半透明の黒を 8 段で薄くする）、言葉が出る。
  //   2026-11-08 に、白からぽつぽつ現れるのを、黒からのフェードインに変えた
  //   ending/bg: 淡い地に一輪のカーネーション（2026-11-05 に本人がくれた絵をお手本に Pixel で。art/ref/ending-carnation.png）。無いうちは白
  const drawEnding = (S) => {
    const k = Math.min(1, S.ending.t / 2)
    // 絵の中で、画面いっぱい（320x240）のもの（今は bg。試しの小さな絵が同じファイルに入っていても選ばないように、大きさで探す）
    const bgArt = ART['ending/bg'], bgName = bgArt && Object.keys(bgArt.pics).find((n) => bgArt.pics[n].length === H && bgArt.pics[n][0].length === W)
    const bg = bgName ? artPic('ending/bg', bgName) : null
    const at = (i) => { if (!bg) return P.white; const ch = bg.rows[Math.floor(i / W)]?.[i % W]; return ch && ch !== '.' ? bg.colors[ch] : P.white }
    for (let i = 0; i < W * H; i++) fb[i] = at(i)
    const dim = 1 - Math.floor(k * 8) / 8
    if (dim > 0) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) tint(x, y, P.black, dim)
    if (S.ending.t < 2.4) return
    // 咲いた花の数は出さない（2026-11-11。死ぬたびに一輪咲くので、生まれ変わりの回数と同じ数になる。本人の頼み）
    const lines = [tr.endTitle, '', tr.endLives(S.lifeNo - 1)]
    // 背景の絵があるときは、花の上端（y 154）と画面の上端のちょうど真ん中（y 77）に、3 行のまとまりの真ん中を合わせる（3 行で 48 ドット）
    const top = bg ? 77 - 24 : 93
    lines.forEach((m, i) => { if (m) text((W - textW(m)) >> 1, top + i * 18, m, i === 0 ? P.bl2 : P.gy4, P.white) })
    // 曲が終わったころ、下に戻り方の案内（2026-11-10）。淡い灰から、少しずつ濃く
    if (S.ending.t >= ENDING_BACK) { const m = S.touchUi ? tr.endBackTouch : tr.endBack, c = S.ending.t < ENDING_BACK + 0.6 ? P.gy6 : S.ending.t < ENDING_BACK + 1.2 ? P.gy5 : P.gy4; text((W - textW(m)) >> 1, 222, m, c, P.white) }
  }


  // 死んだあとの画面: 体が白く光って止まり、ゆっくり暗くなり、死の間際の光と言葉が出る
  const drawDeath = (S, p, t) => {
    const world = S.world, camX = S.cam.x, camY = S.cam.y
    // 死んだ瞬間: 体が白く光って止まる
    // 魚に食べられたとき（S.dead.eaten）は、口が閉じるまで光る（そのあとは口の中で見えない）
    if (S.dead.t < (S.dead.eaten ? 0.16 * 1.6 : DEATH_HOLD) && p) { const pic = artPic(realmOf(world).player, p.onGround ? 'stand' : 'jump'); if (pic) artBlit(pic, Math.round(p.x - camX - 8), Math.round(p.y - camY - 16), p.dir < 0, null, P.white) }
    // 死んだあと、画面がゆっくり暗くなってから次の生へ
    const k = S.dead.t / DEAD_TIME
    // 天で念を失って落ちるとき（mindlost）は、暗くならずに、白く褪せていく
    if (S.dead.mindlost) { if (k > 0.3) for (let i = 0; i < W * H; i++) if (((i % W) + Math.floor(i / W)) % 2 === 0 || k > 0.7) fb[i] = P.white }
    else if (k > 0.55) for (let i = 0; i < W * H; i++) if (((i % W) + Math.floor(i / W)) % 2 === 0 || k > 0.8) fb[i] = dark(fb[i])
    // 死の間際: 淡い光が広がり（光の層で半透明に。2026-11-05 に市松から変えた）、見つけた光が並ぶ。見つけた数がそろっていれば、この道を抜ける
    if ((S.dead.light || S.dead.escape) && k > 0.6) {
      const r = Math.min(60, (k - 0.6) * 90)
      // 光だまり: 真ん中ほど明るく、4 段に刻む
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = (x * x + y * y) / (r * r)
        if (d <= 1) addLight(W / 2 + x, 116 + y, P.bl5, Math.ceil((1 - d) * 4) / 4 * 0.42)
      }
      const msg = S.dead.mindlost ? tr.mindLost : S.dead.escape ? tr.deadEscape : tr.deadLight
      text((W - textW(msg)) >> 1, 96, msg, S.dead.mindlost ? P.bl2 : P.white, S.dead.mindlost ? P.white : P.black)   // 白く明るんだ画面では、青い字
      if (!S.dead.mindlost) drawLightRow(S, k, t)
      // ボタンで先へ進める合図（受け付けるようになってから、ゆっくり明滅）
      if (S.dead.canSkip) { const h = S.touchUi ? tr.deadNextTouch : tr.deadNext; if (Math.sin(t * 3) > -0.6) text((W - textW(h)) >> 1, 214, h, P.gy4) }
      if (S.dead.escape && k > 1.4) { const m2 = S.dead.next ? tr.toRealm(S.dead.next) : tr.escapeNote; text((W - textW(m2)) >> 1, 190, m2, S.dead.mindlost ? P.bl2 : P.ye3, S.dead.mindlost ? P.white : P.black) }
    }
  }

  // 画面の隅の文字（生の数・今いる所・天の花の数・見出し）
  const drawHud = (S, lightLv, t) => {
    const world = S.world
    text(4, 3, tr.life(S.lifeNo), lightLv >= 3 ? P.bl2 : P.gy5, lightLv >= 3 ? P.white : P.black)
    // 右上: 今いる所（道の名前と、部屋の名前。ずっと出す。2026-11-04）。経典の地名は、初めて入ったときに上の真ん中に出す（別）
    //   光の部屋（にあたるもの）は、見つけるまでは名前を出さない（ふつうの部屋に見えるように）
    {
      const rn = { hell: tr.realmHell, animal: tr.realmAnimal, peta: tr.realmPeta, human: tr.realmHuman, deva: tr.realmDeva, human2: tr.realmLast }[world.realm] ?? ''
      const R = S.room, nm = R && (!R.light || S.found?.has(R.index)) ? roomName(R.name) : ''
      // 道の名前はいつも右の端。部屋の名前はその左に、少し間をあけて（「針の床　地獄」）
      const c = lightLv >= 3 ? P.bl2 : P.gy5, sh = lightLv >= 3 ? P.white : P.black, rx = W - textW(rn) - 4
      if (rn) text(rx, 3, rn, c, sh)
      if (nm) text(rx - 10 - textW(nm), 3, nm, c, sh)
    }
    // 天の道: 摘んだ花の数（増え続ける）。右上の道の名前の下
    if (world.realm === 'deva') { const m = tr.bliss(S.bliss ?? 0, S.rain?.dropped ?? 0); text(W - textW(m) - 4, 17, m, P.pk1, P.white) }
    if (S.banner) {
      const b = S.banner, a = b.t < 0.2 ? b.t / 0.2 : b.t > 1.8 ? (2.2 - b.t) / 0.4 : 1
      if (a > 0.5 || Math.floor(b.t * 30) % 2) {
        const s = b.text, x = (W - textW(s)) >> 1
        text(x, b.big ? 96 : 22, s, b.big ? P.ye3 : b.light ? P.bl1 : P.gy6, b.light ? P.white : P.black)
      }
    }
  }

  return { drawReading, drawDeath, drawHud, drawEnding, onSignLink: (x, y) => !!signLinkBox && x >= signLinkBox[0] && x <= signLinkBox[2] && y >= signLinkBox[1] && y <= signLinkBox[3] }
}
