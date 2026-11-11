// スマホの操作（moonblade と同じ作り）: 指で触る画面（pointer: coarse）のときだけ出る
//   縦持ち: 上にゲーム、下に操作の板。横持ち: ゲームの左右の帯に操作。帯が取れないほど狭いときは、ゲームを真ん中に出すだけ
//   左側は浮かぶスティック（指を置いた所が中心になり、引っ張った向きに動く。遠くまで引くと中心がついて来る）。
//     向きは角度で 8 つに分ける（斜めの幅を少し広めに）。右側を押してから着地するまでは、中心を止める（二段目の向きを、一段目の時の中心から測るように）
//   右側は、右半分のどこを押してもボタン一つ（押した所に輪が出る。画面の下を見なくてよいように）。PC のダッシュ（Z）と同じ:
//     遊んでいる間はダッシュ（向きは左のスティック。触れていなければ真上。押している間続き、離すと止まる）。
//     タイトル・記録・看板の窓では「決定」（看板の窓では「閉じる」）
//   試して、やめたもの（2026-11-04。README のスマホの節）: 跳ぶ・ダッシュの二つのボタン、右側を弾いてダッシュ、押すと跳ぶ、固定のスティック
//   板はゲームと同じ色・同じドットの大きさ・同じ字（k8x12）で描く
import { ALL_HEX } from './shade.js'
import { P } from './palette.js'
import { glyph, textWidth, eachDot, FONT_H } from './glyph.js'

const REACH = 14   // スティックの届く長さ（ゲームのドット）
// 向きを 8 方向に: 横・縦の成分が、長さのこの割合より大きければ入れる（0.38 で 8 等分。小さくすると斜めの幅が広がる）
const DIAG = 0.34
const dir8 = (dx, dy) => { const d = Math.hypot(dx, dy) || 1; return [Math.abs(dx / d) > DIAG ? Math.sign(dx) : 0, Math.abs(dy / d) > DIAG ? Math.sign(dy) : 0] }

// links: 板の左上に並べる字のボタン [{ label, on, minW }]（minW: 字の幅より広くそろえたいとき）（記録を消す、デバッグの機能など）。lit が真のものは字を明るく（入っているスイッチ）
export function createTouchPad({ canvas, padCanvas, W, H, labels, links = [] }) {
  const coarse = matchMedia('(pointer: coarse)').matches
  const pctx = padCanvas.getContext('2d')
  let pad = null
  const pointers = new Map()
  let alt = false, altLabel = ''   // メニューや看板の窓の間（setAlt）: 右側の字を「決定」（看板の窓では「閉じる」）に
  let anchorLock = null   // 空中の間、スティックの中心を止める: { air: 空中に出たか, t: 地面にいた時間 }（右側を押した瞬間から、着地するまで。setGrounded）
  let taps = 0, tapGap = false   // 右側を押した回数（一回ずつ、押した瞬間として渡す。続けて押しても、間に離したコマを挟む）

  function layout() {
    const iw = innerWidth, ih = innerHeight
    let scale, mode = null
    if (coarse && ih >= iw) { scale = Math.min(iw / W, (ih - 190) / H); if (scale * W >= iw * 0.7) mode = 'bottom' }
    else if (coarse) { scale = Math.min(ih / H, (iw - 2 * 130) / W); if (scale * H >= ih * 0.6) mode = 'side' }
    if (!mode) return false
    const w = W * scale, h = H * scale, left = Math.round((iw - w) / 2), top = mode === 'bottom' ? 0 : Math.round((ih - h) / 2)
    Object.assign(canvas.style, { position: 'absolute', left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px`, zIndex: 1 })
    const pw = Math.ceil(iw / scale), ph = Math.ceil(ih / scale), ox = left / scale, oy = top / scale
    padCanvas.width = pw; padCanvas.height = ph
    Object.assign(padCanvas.style, { display: 'block', position: 'absolute', left: '0px', top: '0px', width: `${pw * scale}px`, height: `${ph * scale}px`, zIndex: 0 })
    if (mode === 'bottom') {
      const by = oy + H, bh = ph - by, cy = Math.round(by + bh * 0.48), r = Math.round(Math.max(22, Math.min(34, bh * 0.18)))
      pad = { mode, scale, pw, ph, stick: { x: Math.round(pw * 0.24), y: cy }, stickArea: (x, y) => x < pw * 0.5 && y > by, actArea: (x, y) => x >= pw * 0.5 && y > by,
        act: { x: Math.round(pw * 0.76), y: cy, r }, wipe: { x: 4, y: by + 4 } }
    } else {
      const band = ox, cy = Math.round(oy + H * 0.6), r = Math.round(Math.max(18, Math.min(28, band * 0.27)))
      pad = { mode, scale, pw, ph, stick: { x: Math.round(band / 2), y: cy }, stickArea: (x) => x < ox, actArea: (x) => x >= ox + W,
        act: { x: Math.round(ox + W + band / 2), y: cy, r }, wipe: { x: 4, y: 4 } }
    }
    pointers.clear()
    return true
  }

  const xy = (e) => ({ x: e.clientX / pad.scale, y: e.clientY / pad.scale })
  // 左上の字のボタンの範囲（左から、間を 12 ドットあけて並べる）
  //   枠のあるボタンにして、枠のまわり 6 ドットまで押せる（2026-11-07。字だけでは押しにくかった）
  const LINK_PAD = 7, LINK_H = 48   // 高さは 2026-11-07 に 24 から倍に
  const linkBoxes = () => { let x = pad.wipe.x + LINK_PAD; return links.map((l) => { const w = Math.max(textWidth(l.label), l.minW ?? 0), b = { l, x, w }; x += w + LINK_PAD * 2 + 8; return b }) }
  const linkHit = (q) => q.y >= pad.wipe.y - 6 && q.y <= pad.wipe.y + LINK_H + 6 ? linkBoxes().find((b) => q.x >= b.x - LINK_PAD - 6 && q.x <= b.x + b.w + LINK_PAD + 6) : null

  padCanvas.addEventListener('pointerdown', (e) => {
    if (!pad) return
    e.preventDefault()
    const q = xy(e)
    const hit = linkHit(q)
    if (hit) { hit.l.on(); return }
    try { padCanvas.setPointerCapture(e.pointerId) } catch {}
    if (pad.stickArea(q.x, q.y)) pointers.set(e.pointerId, { kind: 'stick', ax: q.x, ay: q.y, x: q.x, y: q.y })
    else if (pad.actArea(q.x, q.y)) { pointers.set(e.pointerId, { kind: 'act', ax: q.x, ay: q.y }); taps++; anchorLock = { air: false, t: 0 } }
  })
  padCanvas.addEventListener('pointermove', (e) => {
    const t = pointers.get(e.pointerId)
    if (!t || t.kind !== 'stick') return
    const q = xy(e)
    t.x = q.x; t.y = q.y
    const dx = t.x - t.ax, dy = t.y - t.ay, d = Math.hypot(dx, dy)
    if (d > REACH && !anchorLock) { t.ax += (dx / d) * (d - REACH); t.ay += (dy / d) * (d - REACH) }   // 遠くまで引くと中心がついて来る（空中では止める）
  })
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) padCanvas.addEventListener(ev, (e) => pointers.delete(e.pointerId))
  padCanvas.addEventListener('contextmenu', (e) => e.preventDefault())

  // 今の指の状態: { x, y（-1〜1。スティック）, dash（右側を押している）, dashPressed（押した瞬間） }
  //   peek: 見るだけ（描くときに使う。押した瞬間を使ってしまわない）
  function state(peek = false) {
    const s = { x: 0, y: 0, dash: false, dashPressed: false }
    if (!pad) return s
    for (const t of pointers.values()) {
      if (t.kind === 'stick') { const dx = t.x - t.ax, dy = t.y - t.ay; if (Math.hypot(dx, dy) > 4) [s.x, s.y] = dir8(dx, dy) }
      else if (t.kind === 'act') s.dash = true
    }
    if (tapGap) { if (!peek) tapGap = false } else if (taps > 0) { s.dashPressed = true; if (!peek) { taps--; tapGap = true } }
    return s
  }

  // 板を描く（毎コマ）
  function render() {
    if (!pad) return
    const c = pctx, { pw, ph } = pad
    const fill = (x, y, w, h, i) => { c.fillStyle = `#${ALL_HEX[i]}`; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)) }
    const disk = (cx, cy, r, i) => { for (let y = -r; y <= r; y++) { const dx = Math.floor(Math.sqrt(r * r - y * y)); fill(cx - dx, cy + y, dx * 2 + 1, 1, i) } }
    const ring = (cx, cy, r, i) => { disk(cx, cy, r, i); disk(cx, cy, r - 1, P.black) }
    const label = (s, cx, y, i) => {
      let x = Math.round(cx - textWidth(s) / 2)
      for (const ch of s) {
        const g = glyph(ch)
        if (g) eachDot(g, (dx, dy) => fill(x + dx, y + dy, 1, 1, i))
        x += g ? g.w : FONT_H >> 1
      }
    }
    fill(0, 0, pw, ph, P.black)
    // 左: スティック
    const stick = [...pointers.values()].find((t) => t.kind === 'stick')
    const ax = stick ? stick.ax : pad.stick.x, ay = stick ? stick.ay : pad.stick.y
    ring(ax, ay, REACH + 6, stick ? P.gy4 : P.gy2)
    let kx = ax, ky = ay
    if (stick) { const dx = stick.x - ax, dy = stick.y - ay, d = Math.hypot(dx, dy) || 1, m = Math.min(d, REACH); kx = ax + (dx / d) * m; ky = ay + (dy / d) * m }
    disk(Math.round(kx), Math.round(ky), 9, stick ? P.gy5 : P.gy3)
    disk(Math.round(kx) - 2, Math.round(ky) - 2, 3, stick ? P.gy6 : P.gy4)
    // 右: 触っていなければ決まった所に輪、触っている間は押した所に塗った輪。字は「ダッシュ」（メニューでは「決定」、看板の窓では「閉じる」）
    const act = [...pointers.values()].find((t) => t.kind === 'act')
    const cx = act ? act.ax : pad.act.x, cy = act ? act.ay : pad.act.y, r = pad.act.r
    ring(cx, cy, r, act ? P.white : P.rd3)
    if (act) disk(cx, cy, r - 3, P.rd2)
    label(alt ? altLabel : labels.dash, cx, cy - 6, act ? P.white : P.rd3)
    for (const b of linkBoxes()) {
      const on = b.l.lit?.(), x0 = b.x - LINK_PAD, w = b.w + LINK_PAD * 2
      fill(x0, pad.wipe.y, w, LINK_H, on ? P.gy2 : P.gy1)   // 枠
      fill(x0 + 1, pad.wipe.y + 1, w - 2, LINK_H - 2, P.black)
      label(b.l.label, b.x + b.w / 2, pad.wipe.y + (LINK_H - FONT_H) / 2, on ? P.ye2 : P.gy4)
    }
  }

  // 体が地面にいるか（毎コマ）。右側を押したあと、空中に出て、また地面に着いたら（0.05 秒）、スティックの中心を止めるのをやめる。
  //   空中に出ないまま 0.4 秒たったとき（地面のダッシュなど）もやめる
  const setGrounded = (g, dt) => {
    if (!anchorLock) return
    if (!g) { anchorLock.air = true; anchorLock.t = 0; return }
    anchorLock.t += dt
    if ((anchorLock.air && anchorLock.t > 0.05) || anchorLock.t > 0.4) anchorLock = null
  }
  return { coarse, layout, state, render, active: () => !!pad, setAlt: (v, lb = '') => { alt = !!v; altLabel = lb }, setGrounded }
}
