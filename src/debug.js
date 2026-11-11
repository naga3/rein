// デバッグモード（2026-11-05。npm run dev のときだけ。しばらくはこれで調整する）
//   画面の下の「記録を消す」の並び（スマホは操作の板の左上）に、デバッグの機能を足していく。
//   場所をコピー（C）: 遊びを止めて、画面の上で場所か範囲を指す。指したマス（範囲）を、チャットに貼る一行にしてクリップボードへ
//     例: 地獄 #7「光の部屋」 (12, 5)  http://…/?at=hell:7:12,5
//         地獄 #7「光の部屋」 (3, 5)〜(8, 9) 6×5 マス  http://…/?at=hell:7:3,5
//     #7 は地図のファイル（src/maps/<道>.json）の rooms の 7 番目（0 から）。(12, 5) はその部屋の中のマス（左上が 0, 0）。範囲の両端も、左上のマスの部屋の中で数える
//     PC: マウスを動かして選び、クリックでその 1 マス、押したままなぞると範囲（離すとコピー）。方向キーで 1 マスずつ、Shift ＋方向キーで範囲を広げる。
//       Enter・Z でコピー。Esc か C でやめる
//     スマホ: ゲームの画面を指でなぞると、なぞり始めから今の指までが範囲（その場で離せば 1 マス）。離すとコピー
//   飛ぶ（F・リンク・スマホの板の「飛ぶ」で入れる・切る）: 死なず、重さを無視して、方向キー（スティック）の向きへ速く動く。壁・床には当たる。
//     ステージを早く動きたいとき
//   ?at=<道>:<部屋の番号>:<x>,<y>（部屋の外なら ?at=<道>:<x>,<y>。地図全体のマス）: その場所から始める
import { TILE } from './world.js'
import { P } from './palette.js'
import { glyph, textWidth, eachDot, FONT_H } from './glyph.js'

// 開発中でも ?public を付けると、公開版と同じに（デバッグの並び・?at・始める道を出さない。2026-11-11。本人の頼み）
export const PUBLIC_VIEW = new URLSearchParams(location.search).has('public')
export const DEBUG = !!import.meta.env.DEV && !PUBLIC_VIEW

// 道の名前（場所の一行に書く。チャットに貼るものなので、ブラウザの言葉に関わらず日本語）
export const realmLabel = (r) => ({ hell: '地獄', animal: '畜生', peta: '餓鬼', human: '人', deva: '天', human2: '再び人' })[r] ?? r
// 場所の一行（ゲームの「場所をコピー」とステージエディタで同じ形）: 範囲 g（地図のマス x0, y0〜x1, y1）、rooms は部屋の一覧（x, y, name）、
//   ri は左上のマスの部屋の番号（無ければ -1）、gameUrl はゲームのページ（?at= を付ける）
export function placeLine(realm, rooms, ri, g, gameUrl) {
  const name = realmLabel(realm)
  const r = ri >= 0 ? rooms[ri] : { x: 0, y: 0 }
  const x = g.x0 - r.x, y = g.y0 - r.y, one = g.x1 === g.x0 && g.y1 === g.y0
  const where = one ? `(${x}, ${y})` : `(${x}, ${y})〜(${g.x1 - r.x}, ${g.y1 - r.y}) ${g.x1 - g.x0 + 1}×${g.y1 - g.y0 + 1} マス`
  if (ri < 0) return { short: `${name} ${where}`, full: `${name} 地図全体 ${where}  ${gameUrl}?at=${realm}:${g.x0},${g.y0}` }
  return { short: `${name} #${ri}「${r.name}」 ${where}`, full: `${name} #${ri}「${r.name}」 ${where}  ${gameUrl}?at=${realm}:${ri}:${x},${y}` }
}

// クリップボードへ。http（tailscale でスマホから開いたとき）では navigator.clipboard が使えないので、古いやり方（execCommand）に替える。
//   どちらも、押した瞬間（キー・指・クリックのイベントの中）に呼ぶ
export function copyText(s) {
  if (window.isSecureContext && navigator.clipboard) { navigator.clipboard.writeText(s).catch(() => legacyCopy(s)); return }
  legacyCopy(s)
}
function legacyCopy(s) {
  const ta = document.createElement('textarea')
  ta.value = s; ta.setAttribute('readonly', ''); Object.assign(ta.style, { position: 'fixed', left: '-9999px', top: '0' })
  document.body.append(ta); ta.select(); ta.setSelectionRange(0, s.length)
  try { document.execCommand('copy') } catch {}
  ta.remove()
}

// ?at= を読む: { realm, room（無ければ null）, x, y }
export function parseAt() {
  const v = new URLSearchParams(location.search).get('at')
  const m = v && v.match(/^([a-z0-9]+):(?:(\d+):)?(-?\d+),(-?\d+)$/)
  return m ? { realm: m[1], room: m[2] != null ? +m[2] : null, x: +m[3], y: +m[4] } : null
}
// ?at= の場所の、地図全体のマス
export function atTile(world, at) {
  const r = at.room != null ? world.rooms[at.room] : null
  return r ? { tx: r.x + at.x, ty: r.y + at.y } : { tx: at.x, ty: at.y }
}

// 場所を指す: getS で今のゲーム。canvas の上の指・マウスで選ぶ
export function createPicker({ canvas, W, H, getS, texts }) {
  let pick = null   // { x, y: 今の指・マウス（画面のドット）, a: 範囲の始まり（地図のマス { tx, ty }。無ければ 1 マス）, touch: 指で選んでいる }
  let toast = null  // { text, t }
  const tileAtScreen = (S) => {
    const tx = Math.floor((pick.x + S.cam.x) / TILE), ty = Math.floor((pick.y + S.cam.y) / TILE)
    return { tx, ty }
  }
  // 選んでいる範囲（地図のマス。左上 x0, y0 から右下 x1, y1 まで）
  const rangeOf = (S) => {
    const c = tileAtScreen(S), a = pick.a || c
    return { x0: Math.min(a.tx, c.tx), y0: Math.min(a.ty, c.ty), x1: Math.max(a.tx, c.tx), y1: Math.max(a.ty, c.ty) }
  }
  const lineOf = (S) => {
    const w = S.world, g = rangeOf(S), { x0: tx, y0: ty } = g
    const ri = tx >= 0 && ty >= 0 && tx < w.w && ty < w.h ? w.roomOf[ty * w.w + tx] : -1
    return placeLine(S.realm, w.rooms, ri, g, `${location.origin}${location.pathname}`)
  }
  const toCanvas = (e) => {
    const b = canvas.getBoundingClientRect()
    return { x: Math.max(0, Math.min(W - 1, ((e.clientX - b.left) / b.width) * W)), y: Math.max(0, Math.min(H - 1, ((e.clientY - b.top) / b.height) * H)) }
  }
  const start = () => {
    const S = getS(), p = S.player
    if (!S.world || !p) return
    pick = { x: Math.round(p ? p.x - S.cam.x : W / 2), y: Math.round(p ? p.y - 8 - S.cam.y : H / 2), a: null, touch: false }
  }
  const done = () => {
    const S = getS(), l = lineOf(S)
    copyText(l.full)
    toast = { text: `${texts.copied}: ${l.short}`, t: 0 }
    pick = null
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (!pick) return
    e.preventDefault(); e.stopPropagation()
    Object.assign(pick, toCanvas(e), { touch: e.pointerType !== 'mouse' })
    pick.a = tileAtScreen(getS())   // ここから、なぞった所までが範囲
  })
  canvas.addEventListener('pointermove', (e) => { if (pick && (e.pointerType === 'mouse' || e.buttons)) Object.assign(pick, toCanvas(e)) })
  canvas.addEventListener('pointerup', (e) => { if (!pick) return; e.preventDefault(); Object.assign(pick, toCanvas(e)); done() })
  // キー: 遊んでいる間に C で始める。選んでいる間のキーは全部ここで受ける（Esc でタイトルに戻らないように）。受けたら true
  const onKey = (e, playing) => {
    if (!pick) {
      if (playing && (e.key === 'c' || e.key === 'C') && !e.repeat) { start(); return !!pick }
      return false
    }
    e.preventDefault()
    const k = e.key
    if (k === 'Escape' || k === 'c' || k === 'C') pick = null
    else if (k === 'Enter' || k === 'z' || k === 'Z' || k === 'x' || k === 'X' || k === ' ') done()
    else if (k.startsWith('Arrow') && e.shiftKey && !pick.a) pick.a = tileAtScreen(getS())   // Shift ＋方向キー: 今のマスから範囲を広げる
    else if (k.startsWith('Arrow') && !e.shiftKey) pick.a = null
    if (k === 'ArrowLeft') pick.x = Math.max(0, pick.x - TILE)
    else if (k === 'ArrowRight') pick.x = Math.min(W - 1, pick.x + TILE)
    else if (k === 'ArrowUp') pick.y = Math.max(0, pick.y - TILE)
    else if (k === 'ArrowDown') pick.y = Math.min(H - 1, pick.y + TILE)
    return true
  }
  // 字（縁取りつき）
  const text = (fb, s, x, y, c) => {
    const put = (dx, dy, col) => { if (dx >= 0 && dy >= 0 && dx < W && dy < H) fb[dy * W + dx] = col }
    let cx = x
    for (const ch of s) {
      const g = glyph(ch)
      if (g) {
        eachDot(g, (i, j) => { for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) put(cx + i + a, y + j + b, P.black) })
        eachDot(g, (i, j) => put(cx + i, y + j, c))
      }
      cx += g ? g.w : FONT_H >> 1
    }
  }
  // 毎コマ、ゲームを描いたあとに重ねる
  const draw = (fb, t, dt) => {
    const S = getS()
    if (pick && S.world) {
      // 範囲を枠で囲む（左上のマスの外側の 1 ドットから、右下のマスの外側の 1 ドットまで）
      const g = rangeOf(S), sx = g.x0 * TILE - S.cam.x, sy = g.y0 * TILE - S.cam.y, bw = (g.x1 - g.x0 + 1) * TILE, bh = (g.y1 - g.y0 + 1) * TILE
      const c = Math.floor(t * 4) % 2 ? P.white : P.ye2
      const put = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) fb[y * W + x] = c }
      for (let i = -1; i <= bw; i++) { put(sx + i, sy - 1); put(sx + i, sy + bh) }
      for (let i = -1; i <= bh; i++) { put(sx - 1, sy + i); put(sx + bw, sy + i) }
      const l = lineOf(S).short, hint = pick.touch ? texts.hintTouch : texts.hint
      const ly = sy < H / 2 ? H - 30 : 18   // 指した所と反対の側に（上は、部屋の名前と生の数の下）
      text(fb, l, Math.max(2, Math.round((W - textWidth(l)) / 2)), ly, P.white)
      text(fb, hint, Math.max(2, Math.round((W - textWidth(hint)) / 2)), ly + 14, P.gy4)
    }
    if (S.fly && !pick) text(fb, texts.flying, Math.round((W - textWidth(texts.flying)) / 2), H - 18, P.ye2)   // 飛んでいる間の印
    if (toast) {
      toast.t += dt
      if (toast.t > 2.2) toast = null
      else text(fb, toast.text, Math.max(2, Math.round((W - textWidth(toast.text)) / 2)), H - 18, P.ye2)
    }
  }
  return { start, onKey, draw, picking: () => !!pick }
}

// 飛ぶ: 入れる・切るのスイッチ（F・リンク・板の「飛ぶ」）
export function createFly(onChange = () => {}) {
  let on = false
  const toggle = () => { on = !on; onChange(on) }
  addEventListener('keydown', (e) => { if ((e.key === 'f' || e.key === 'F') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) toggle() })
  return { on: () => on, toggle }
}
