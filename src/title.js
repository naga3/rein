// タイトル画面と、記録の画面（色の番号の画面 fb に描く。ゲームと同じ色・字）
//   タイトル: 題字（Pixel の ui/logo。無ければゲームの字を 2 倍）、これまでに咲いた花の花畑（遊ぶほど育つ）、項目
//   記録: 道ごとに見つけた光の部屋の数（2026-11-06 から、どの道も「光の部屋」と呼ぶ）、天で拾った花のいちばん、生まれ変わりの回数、咲いた花の数
import { P } from './palette.js'
import { glyph, textWidth, eachDot, FONT_H } from './glyph.js'
import { ART } from './art.js'
import { tr } from './i18n.js'
import { createWalkers } from './titlewalk.js'

const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }

export function createTitle(fb, W, H) {
  const px = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) fb[y * W + x] = c }
  const textW = (s, k = 1) => textWidth(s, k)
  const text = (x, y, s, c, shadow = P.black, k = 1) => {
    let cx = Math.round(x)
    for (const ch of s) {
      const g = glyph(ch)
      if (g) eachDot(g, (i, j) => { for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) { if (shadow != null) px(cx + i * k + a + 1, y + j * k + b + 1, shadow); px(cx + i * k + a, y + j * k + b, c) } })
      cx += (g?.w ?? (FONT_H >> 1)) * k
    }
  }
  const walkers = createWalkers(px, W)   // 花畑の中を歩く、道ごとの主人公たち（src/titlewalk.js）
  const center = (y, s, c, shadow, k) => text((W - textW(s, k)) / 2, y, s, c, shadow, k)
  const blit = (ref, name, x, y) => {
    const a = ART[ref], rows = a?.pics?.[name]
    if (!rows) return false
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') px(x + i, y + j, a.colors[ch]) }))
    return true
  }

  // 背景: 夜明け前の暗い空と、地面。花畑はこれまでに咲いた花の数だけ（多すぎるときは間引く）
  const background = (t, flowers) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fb[y * W + x] = y < 120 ? P.black : y < 190 ? ((x + y) % 2 && y < 128 ? P.pu0 : y > 182 && (x + y) % 2 ? P.rd0 : P.pu0) : P.ink
    for (let i = 0; i < 50; i++) { const x = Math.floor(hash(i, 1) * W), y = Math.floor(hash(i, 2) * 150); if (Math.sin(t * (0.6 + hash(i, 3)) + i) > 0.3) px(x, y, hash(i, 4) < 0.3 ? P.gy4 : P.gy2) }
    for (let x = 0; x < W; x++) { px(x, 196, P.rd1); px(x, 197, P.gy1) }
    const n = Math.min(flowers, 260)
    for (let i = 0; i < n; i++) {
      const row = i % 4, x = Math.floor(hash(i, 7) * (W + 10)) - 5, y = 198 + row * 10 + Math.floor(hash(i, 8) * 6)
      const wind = Math.sin(t * 1.4 + x * 0.05 + row) > 0.55
      if (!blit('flower/carnation', wind ? 'sway' : 'bloom', x - 5, y - 14)) { px(x, y - 4, P.rd3); px(x + 1, y - 4, P.rd2); px(x, y - 3, P.gr3) }
    }
  }
  // 大きな題字（2026-11-10。本人がくれた題字の絵を、Pixel がドットを合わせて ui/logo の title に。art/ref/title-logo.png。306 × 124 ほど）。
  //   画面の幅いっぱいなので、上に詰めて置き、項目はそのすぐ下に詰めて並べる（logoBig のとき、間を 22 → 4、項目の間を 16 → 14）
  let logoBig = false
  const logo = (t) => {
    const big = ART['ui/logo']?.pics?.title
    logoBig = !!big
    if (big) { const y = 4; blit('ui/logo', 'title', Math.round((W - big[0].length) / 2), y); return y + big.length }
    const a = ART['ui/logo']?.pics?.logo
    if (a) { blit('ui/logo', 'logo', Math.round((W - a[0].length) / 2), 26); return 26 + a.length }
    center(34, 'RE: in', P.gy5, P.black, 1)
    center(48, 'CARNATION', P.white, P.rd1, 2)
    blit('flower/carnation', Math.sin(t * 1.4) > 0.6 ? 'sway' : 'bloom', Math.round((W - textW('CARNATION', 2)) / 2) - 14, 50)
    return 80
  }

  // items: [{ label }]、sel: 選んでいる番号、reached: たどり着いた道（主人公が花畑を歩く）
  function drawTitle(t, flowers, items, sel, reached = []) {
    background(t, flowers)
    walkers.step(t, reached); walkers.draw(t)
    const top = logo(t) + (logoBig ? 4 : 22), pitch = logoBig ? 14 : 16
    items.forEach((it, i) => {
      const y = top + i * pitch, on = i === sel
      if (on) { const w = textW(it.label) + 16; for (let x = 0; x < w; x++) px(Math.round((W - w) / 2) + x, y + 13, Math.floor(t * 3) % 2 ? P.rd3 : P.rd2) }
      center(y, it.label, on ? P.white : P.gy4, P.black)
    })
    // 項目の当たり（指で触ったとき）: [上, 下, 左, 右]。横は下線の範囲（字の幅＋両側 8 ドット。2026-11-05 に画面の幅いっぱいから狭めた）
    return items.map((it, i) => { const w = textW(it.label) + 16, x0 = Math.round((W - w) / 2); return [top + i * pitch - 2, top + i * pitch + 13, x0, x0 + w] })
  }
  // rows: [{ label, value }]、foot: 一番下の言葉
  function drawList(t, flowers, title, rows, foot, sel = -1) {
    background(t, flowers)
    for (let y = 20; y < 186; y++) for (let x = 24; x < W - 24; x++) if ((x + y) % 2 === 0) px(x, y, P.black)
    center(28, title, P.white, P.black)
    const pitch = rows.length > 7 ? 14 : 16   // 行が多いときは詰める（下の言葉と重ならないように）
    rows.forEach((r, i) => {
      const y = 52 + i * pitch, on = i === sel
      text(40, y, r.label, on ? P.white : P.gy5, P.black)
      if (r.value) text(W - 40 - textW(r.value), y, r.value, on ? P.white : P.ye3, P.black)
      if (on) for (let x = 36; x < W - 36; x++) px(x, y + 13, P.rd2)
    })
    if (foot) center(168, foot, P.gy3, P.black)
    return rows.map((_, i) => [52 + i * pitch - 2, 52 + i * pitch + 14, 36, W - 36])   // 横は下線の範囲
  }
  // 看板の一覧（2026-11-06）: 上に道の名前、その道の読んだ数。左に看板の絵を格子（4 列 × 5 段 = 20。一つの道に 20 まで）に並べ、
  //   右に選んでいる看板の出典と言葉（右の幅で折り返す）。看板の絵はそのまま、読んだ看板は根もとに花（ゲームの中と同じ）。まだ読んでいない看板は「？？？」
  //   tabs: [{ label }]、tab: 今の道、items: [{ label, lines, read }]、sel: 選んでいる看板、count: 読んだ数の字、foot: 一番下の言葉
  //   返すのは当たり: { tabs, items: [[上, 下, 左, 右, 番号]] }
  const COLS = 4, ROWS = 5
  function drawSigns(t, flowers, title, tabs, tab, items, sel, count, foot, unreadNote) {
    background(t, flowers)
    for (let y = 10; y < 210; y++) for (let x = 12; x < W - 12; x++) if ((x + y) % 2 === 0) px(x, y, P.black)
    center(14, title, P.white, P.black)
    // 道の名前
    const gap = 14, tw = tabs.reduce((n, b) => n + textW(b.label), 0) + gap * (tabs.length - 1)
    let x = Math.round((W - tw) / 2)
    const tabHits = tabs.map((b, i) => {
      const w = textW(b.label), on = i === tab
      text(x, 32, b.label, on ? P.white : P.gy4, P.black)
      if (on) for (let k = -2; k < w + 2; k++) px(x + k, 45, Math.floor(t * 3) % 2 ? P.rd3 : P.rd2)
      const h = [28, 48, x - 6, x + w + 6]; x += w + gap; return h
    })
    center(50, count, P.ye3, P.black)
    // 左: 看板の絵の格子
    const gx = 22, gy = 68, cw = 26, ch = 24
    const sign = ART['sign/sign']?.pics?.sign, colors = ART['sign/sign']?.colors
    const itemHits = items.map((it, i) => {
      const cx = gx + (i % COLS) * cw, cy = gy + Math.floor(i / COLS) * ch, on = i === sel
      // 看板はそのまま。読んだ看板には、ゲームの中と同じく根もとに花（sway でそよぐ。看板ごとに少しずらす）
      if (sign) sign.forEach((row, j) => [...row].forEach((c, k) => { if (c !== '.') px(cx + 5 + k, cy + 2 + j, colors[c]) }))
      if (it.read) {
        const fa = ART['sign/flower'], sw = fa?.anims?.sway
        let name = 'bloom'
        if (sw) { const total = sw.ms.reduce((a, b) => a + b, 0); let ms = ((t + i * 0.71) * 1000) % total; for (let f = 0; f < sw.frames.length; f++) { if (ms < sw.ms[f]) { name = sw.frames[f]; break } ms -= sw.ms[f] } }
        const fl = fa?.pics?.[name] || fa?.pics?.bloom
        if (fl) fl.forEach((row, j) => [...row].forEach((c, k) => { if (c !== '.') px(cx + 19 - (row.length >> 1) + k, cy + 18 - fl.length + j, fa.colors[c]) }))
      }
      if (on) { const c = Math.floor(t * 3) % 2 ? P.rd3 : P.rd2; for (let k = 0; k < cw - 2; k++) { px(cx + 1 + k, cy, c); px(cx + 1 + k, cy + ch - 3, c) } for (let k = 0; k < ch - 2; k++) { px(cx + 1, cy + k, c); px(cx + cw - 2, cy + k, c) } }
      return [cy, cy + ch - 2, cx, cx + cw - 1, i]
    })
    // 右: 選んでいる看板の出典と言葉（折り返す）
    const rx = gx + COLS * cw + 10, rw = W - 18 - rx, it = items[sel]
    if (it) {
      text(rx, gy, it.label, it.read ? P.ye3 : P.gy3, P.black)
      let y = gy + 18
      const P_END = '、。，．」』）'
      // 折り返し: 句読点は行の頭に来ないように（はみ出す句読点は前の行にぶら下げ、次が句読点なら一字前で折る）
      const wrap = (s) => { const cs = [...s], out = []; let cur = ''; cs.forEach((c, i) => { if (textW(cur + c) > rw && !P_END.includes(c)) { if (P_END.includes(cs[i + 1] ?? '') && cur.length > 1) { out.push([...cur].slice(0, -1).join('')); cur = [...cur].slice(-1).join('') + c } else { out.push(cur); cur = c } } else cur += c }); if (cur) out.push(cur); return out }
      // 行の頭が @ の行は、まとまりごとの出典（看板の窓と同じ。右寄せ、出典の色）
      for (const line of it.read ? it.lines : [unreadNote]) { const src = line.startsWith('@'), body = src ? line.slice(1) : line; for (const part of wrap(body)) { if (y > 186) break; if (src) text(rx + rw - textW(part), y, part, P.br4, P.black); else text(rx, y, part, it.read ? P.gy6 : P.gy3, P.black); y += 13 } }
    }
    if (foot) center(196, foot, P.gy3, P.black)
    return { tabs: tabHits, items: itemHits }
  }
  // 窓（操作の説明など）: タイトルの上に、少し暗くした上で、真ん中に枠つきの窓。lines は左寄せ
  function drawPopup(t, title, lines, foot) {
    for (let y = 0; y < H; y++) for (let x = (y & 1); x < W; x += 2) fb[y * W + x] = P.black
    const LH = 14, bw = Math.min(W - 12, Math.max(textW(title), ...lines.map((l) => textW(l)), textW(foot)) + 28), bh = lines.length * LH + 58
    const bx = (W - bw) >> 1, by = (H - bh) >> 1
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      const edge = y === by || y === by + bh - 1 || x === bx || x === bx + bw - 1, inner = y === by + 2 || y === by + bh - 3 || x === bx + 2 || x === bx + bw - 3
      px(x, y, edge ? P.gy4 : inner ? P.br2 : P.ink)
    }
    center(by + 10, title, P.ye3, P.black)
    lines.forEach((l, i) => text(bx + 14, by + 30 + i * LH, l, P.gy6, P.black))
    for (let x = bx + 8; x < bx + bw - 8; x += 2) px(x, by + bh - 21, P.gy2)
    center(by + bh - 17, foot, P.gy4, P.black)
  }
  // ポーズの窓（2026-11-11）: 止まったゲームの上を市松に暗くし、真ん中に枠つきの窓。見出しと項目（選んでいるものに下線）、下に案内。
  //   返すのは項目の当たり [上, 下, 左, 右]
  function drawPause(t, title, items, sel, foot) {
    for (let y = 0; y < H; y++) for (let x = (y & 1); x < W; x += 2) fb[y * W + x] = P.black
    const LH = 18, bw = Math.min(W - 12, Math.max(textW(title), ...items.map((it) => textW(it.label)), textW(foot)) + 40), bh = items.length * LH + 62
    const bx = (W - bw) >> 1, by = (H - bh) >> 1
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      const edge = y === by || y === by + bh - 1 || x === bx || x === bx + bw - 1, inner = y === by + 2 || y === by + bh - 3 || x === bx + 2 || x === bx + bw - 3
      px(x, y, edge ? P.gy4 : inner ? P.br2 : P.ink)
    }
    center(by + 10, title, P.ye3, P.black)
    const top = by + 32
    items.forEach((it, i) => {
      const y = top + i * LH, on = i === sel
      if (on) { const w = textW(it.label) + 16; for (let x = 0; x < w; x++) px(Math.round((W - w) / 2) + x, y + 13, Math.floor(t * 3) % 2 ? P.rd3 : P.rd2) }
      center(y, it.label, on ? P.white : P.gy4, P.black)
    })
    for (let x = bx + 8; x < bx + bw - 8; x += 2) px(x, by + bh - 21, P.gy2)
    center(by + bh - 17, foot, P.gy4, P.black)
    return items.map((it, i) => { const w = textW(it.label) + 16, x0 = Math.round((W - w) / 2); return [top + i * LH - 3, top + i * LH + 15, x0, x0 + w] })
  }
  return { drawTitle, drawList, drawSigns, drawPopup, drawPause }
}
