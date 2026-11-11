// 入力: キーボード・ゲームパッド・スマホを、毎コマの { x, y, dash, dashPressed, okPressed（決定・閉じる）, reset, upPressed, downPressed } にする
//   遊ぶときのボタンはダッシュ（Z・Shift、パッドの B・X・RB、スマホの右側）だけ。決定（Space、パッドの A。ok）は、メニューと看板の窓の決定・閉じるに使う（2026-11-06 に跳ぶ〈jump〉から名前を改めた。ジャンプはもう無い）
//   X キーは看板の原典を開くだけ（2026-11-06。main.js・editor.js の keydown で。ここでは拾わない）
const KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down', ' ': 'ok', z: 'dash', Shift: 'dash', r: 'reset' }   
const keyOf = (e) => KEYMAP[e.key] || KEYMAP[e.key.toLowerCase?.()]
const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)   // 文字の欄に書いているときは拾わない

export function createInput() {
  const held = new Set()
  const pressed = new Set()
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e)) return   // Ctrl+R（読み直し）などは、ブラウザに任せる
    const k = keyOf(e)
    if (!k) return
    e.preventDefault()
    if (!held.has(k)) pressed.add(k)
    held.add(k)
  })
  addEventListener('keyup', (e) => { const k = keyOf(e); if (k) held.delete(k) })
  addEventListener('blur', () => held.clear())

  // ゲームパッド（A 決定、B・X・RB ダッシュ、十字かスティック）
  const padPrev = { ok: false, dash: false, pause: false, up: false, down: false }
  const readPad = () => {
    const gp = [...(navigator.getGamepads?.() || [])].find(Boolean)
    if (!gp) return null
    const b = (i) => !!gp.buttons[i]?.pressed
    let x = Math.abs(gp.axes[0]) > 0.35 ? gp.axes[0] : 0, y = Math.abs(gp.axes[1]) > 0.5 ? gp.axes[1] : 0
    if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = -1; if (b(13)) y = 1
    const ok = b(0), dash = b(1) || b(2) || b(5), pause = b(8) || b(9)   // Select・Start: ポーズ（2026-11-11。前は Select でその場で死ぬ）
    const up = y < 0, down = y > 0
    const out = { x: Math.sign(x) * Math.min(1, Math.abs(x) * 1.4), y: Math.sign(y), ok, dash, okPressed: ok && !padPrev.ok, dashPressed: dash && !padPrev.dash, pause: pause && !padPrev.pause, upPressed: up && !padPrev.up, downPressed: down && !padPrev.down }
    Object.assign(padPrev, { ok, dash, pause, up, down })
    return out
  }

  // スマホの操作（src/touchpad.js の state()）。読むたびに渡す
  let touch = null, touchPrev = { up: false, down: false }
  const setTouch = (s) => { touch = s }

  // 一コマ分を読む（押した瞬間の印は、読んだら消える）
  const read = () => {
    const x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0)
    const y = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0)
    const inp = { x, y, ok: held.has('ok'), dash: held.has('dash'), okPressed: pressed.has('ok'), dashPressed: pressed.has('dash'), reset: pressed.has('reset'), upPressed: pressed.has('up'), downPressed: pressed.has('down') }
    pressed.clear()
    const pad = readPad()
    if (pad) {
      if (!inp.x) inp.x = pad.x
      if (!inp.y) inp.y = pad.y
      inp.ok ||= pad.ok; inp.dash ||= pad.dash; inp.okPressed ||= pad.okPressed; inp.dashPressed ||= pad.dashPressed; inp.pause = !!pad.pause; inp.upPressed ||= pad.upPressed; inp.downPressed ||= pad.downPressed
    }
    if (touch) {
      if (!inp.x) inp.x = touch.x
      if (!inp.y) inp.y = touch.y
      inp.dash ||= touch.dash
      inp.dashPressed ||= touch.dashPressed
      inp.upPressed ||= touch.y < 0 && !touchPrev.up
      inp.downPressed ||= touch.y > 0 && !touchPrev.down
      touchPrev = { up: touch.y < 0, down: touch.y > 0 }
    }
    return inp
  }
  const clear = () => { held.clear(); pressed.clear() }
  return { read, clear, setTouch }
}
