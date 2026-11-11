// 入口: 入力（src/input.js）、ループ
import { textWidth } from './glyph.js'
import { ALL_HEX } from './shade.js'
import { createGame } from './game.js'
import { MAPS } from './maps.js'
import { createRenderer, W, H } from './render.js'
import { DEFAULTS } from './tune.js'
import { createInput } from './input.js'
import { tr, LANG, roomName } from './i18n.js'
import { createTouchPad } from './touchpad.js'
import { createMusic } from './music.js'
import { REALMS, devStartRealm, DEV_REALM_KEY, lightLabel } from './realms.js'
import { createMenu } from './menu.js'
import { DEBUG, createPicker, createFly, parseAt, atTile } from './debug.js'
import { TILE, isSolidKind, tileAt, K } from './world.js'

const canvas = document.getElementById('c')
const ctx = canvas.getContext('2d')
const img = ctx.createImageData(W, H)
const out32 = new Uint32Array(img.data.buffer)
const fb = new Uint8Array(W * H)
const renderer = createRenderer(fb)
const PAL32 = new Uint32Array(256)
ALL_HEX.forEach((h, i) => { const n = parseInt(h, 16); PAL32[i] = 0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16) })

const T = DEFAULTS
let S = createGame({ maps: MAPS })
if (import.meta.env.DEV) window.game = () => ({ S, T })
const hasSave = () => { try { return !!localStorage.getItem('reincarnation-save-v5') } catch { return false } }   // 2026-11-08 に v5（光の部屋の番号で覚える）にした。前の記録は消える

// スマホ（指で触る画面）では、ゲームと操作の板を並べる。そうでなければ、整数倍に拡大して真ん中に
// デバッグモード（npm run dev のときだけ。src/debug.js）: 場所をコピーなど。画面の下の「記録を消す」の並び（スマホは板の左上）に置く
const picker = DEBUG ? createPicker({ canvas, W, H, getS: () => S, texts: { hint: tr.pickHint, hintTouch: tr.pickHintTouch, copied: tr.copied, flying: matchMedia('(pointer: coarse)').matches ? tr.flyingTouch : tr.flying } }) : null
const startPick = () => { if (menu.mode === 'play' && !S.reading) picker.start() }
const fly = DEBUG ? createFly((v) => { const a = document.getElementById('fly'); if (a) a.textContent = v ? `${tr.fly} ●` : tr.fly }) : null
// スマホのデバッグの並び（2026-11-07）: 板の左上の「デバッグ」で、PC と同じ並び（#keys。HTML のまま）を画面の上に重ねて開く・閉じる
let devOpen = false
const setDevOpen = (v) => { devOpen = v; fit() }
const touch = createTouchPad({ canvas, padCanvas: document.getElementById('pad'), W, H, labels: { dash: tr.padDash },
  // 板の左上の字のボタン: 開発中は「デバッグ」（記録を消す・場所をコピー・飛ぶは、デバッグの並びからたどる。2026-11-07）
  //   その横に「ポーズ」（2026-11-11。遊んでいる間だけ効く。Esc と同じ）
  //   公開版は「ポーズ」だけ（2026-11-11。「記録を消す」はタイトルの項目から）
  links: [...(DEBUG ? [{ label: tr.debugShort, on: () => setDevOpen(!devOpen), lit: () => devOpen || fly.on() }] : []), { label: tr.pauseShort, on: () => menu.pause(), minW: textWidth(tr.debugShort) }] })   // ポーズはデバッグと同じ幅に
function fit() {
  const onPad = touch.layout(), keys = document.getElementById('keys')
  keys.classList.toggle('touch', onPad)
  keys.style.display = onPad && !(DEBUG && devOpen) ? 'none' : ''
  if (onPad) return
  const s = Math.max(1, Math.floor(Math.min((innerWidth - 24) / W, (innerHeight - 40) / H)))
  Object.assign(canvas.style, { position: '', left: '', top: '', width: `${W * s}px`, height: `${H * s}px` })
}
addEventListener('resize', fit)
// 画面の下の説明（言葉は src/i18n.js）
document.documentElement.lang = LANG
// 画面の下: 記録を消す・デバッグのリンクだけ（操作の説明はタイトルの「操作」に移した。2026-11-06）
document.getElementById('keys').innerHTML = (DEBUG ? `<a href="#" id="devClose">${tr.debugClose}</a><a href="#" id="wipe">${tr.wipe}</a><a href="#" id="pick">${tr.pick}</a><a href="#" id="fly">${tr.fly}</a><a href="#" id="complete">${tr.complete}</a><a href="#" id="freeLoop">${tr.freeLoop}</a><a href="editor.html" id="editorLink">${tr.editor}</a><label id="devRealmBox">${tr.devRealm} <select id="devRealm"></select></label><label>${tr.devRoom} <select id="devRoom"></select></label>` : '')
// ステージエディタは、今いる道の地図で開く（2026-11-06。前はいつも地獄だった）
document.getElementById('editorLink')?.addEventListener('click', (e) => { e.currentTarget.href = `editor.html?map=${REALMS[S.realm]?.map ?? 'hell'}` })
// 画面の下の「記録を消す」は開発中だけ（2026-11-11。公開版では出さない。記録を消すのはタイトルの項目から）
if (DEBUG) document.getElementById('wipe').onclick = (e) => { e.preventDefault(); if (confirm(tr.wipeAsk)) S.reset() }
if (DEBUG) document.getElementById('pick').onclick = (e) => { e.preventDefault(); setDevOpen(false); startPick() }   // スマホでは、並びを閉じてから画面を指す
if (DEBUG) document.getElementById('devClose').onclick = (e) => { e.preventDefault(); setDevOpen(false) }
// 始める道（デバッグ。2026-11-07）: タイトルの「はじめる・つづける」で、この道から。選ぶとブラウザに覚える（src/realms.js の devStartRealm）
if (DEBUG) {
  const sel = document.getElementById('devRealm')
  const names = { hell: tr.realmHell, animal: tr.realmAnimal, peta: tr.realmPeta, human: tr.realmHuman, deva: tr.realmDeva, human2: tr.signsLast }
  sel.append(new Option(tr.devRealmSaved, ''), ...Object.keys(REALMS).filter((r) => MAPS[r]).map((r) => new Option(names[r] ?? r, r)))
  sel.value = devStartRealm() ?? ''
  // 画面（部屋）へ飛ぶ: 始める道の部屋の名前を並べ、選ぶとすぐその部屋へ（記録どおりのときは、今いる道の部屋）
  const roomSel = document.getElementById('devRoom')
  const fillRooms = () => {
    const realm = sel.value || S.realm, rooms = MAPS[realm] || []
    roomSel.replaceChildren(new Option(tr.devRoomPick, ''), ...rooms.map((r, i) => new Option(`#${i} ${r.light && r.no != null ? `${lightLabel(realm, r.no)} ` : ''}${roomName(r.name)}`, `${realm}:${i}`)))   // 光の部屋は番号も（3-5 など。2026-11-08）
  }
  fillRooms()
  sel.onchange = () => { try { localStorage.setItem(DEV_REALM_KEY, sel.value) } catch {} fillRooms(); sel.blur() }   // 選んだら離す（矢印キーで道が変わらないように）
  roomSel.onfocus = fillRooms
  roomSel.onchange = () => {
    const [realm, ri] = roomSel.value.split(':'), r = MAPS[realm]?.[+ri]
    roomSel.blur()
    if (!r) return
    // 部屋の中で、左下から探した最初の立てる所（空いたマスで、下が床、上も空き）
    const at = (x, y) => r.rows[y]?.[x]
    const solid = (c) => c === '#' || c === 'D' || c === 'F'
    // 部屋に「はじまり」（S）があればそこ。輪の道（再び人）は、道の始まり（写しの画面の先）から探す（2026-11-07。写しの画面に出ていた）
    let spot = null
    r.rows.forEach((row, y) => { const x = row.indexOf('S'); if (x >= 0 && !spot) spot = [x, y] })
    for (let x = Math.max(1, r.loopStart || 0); x < r.rows[0].length - 1 && !spot; x++) for (let y = r.rows.length - 2; y > 0; y--) if (at(x, y) !== '#' && solid(at(x, y + 1)) && at(x, y - 1) !== '#' && !'^v<>~'.includes(at(x, y))) { spot = [x, y]; break }
    const [x, y] = spot || [Math.floor(r.rows[0].length / 2), Math.floor(r.rows.length / 2)]
    jumpTo(realm, r.x + x, r.y + y)
    history.replaceState(null, '', `?at=${realm}:${ri}:${x},${y}`)   // 読み直しても、その部屋から
    roomSel.value = ''
    setDevOpen(false)   // スマホ: 飛んだら並びを閉じる
  }
}
if (DEBUG) {
  document.getElementById('fly').onclick = (e) => { e.preventDefault(); fly.toggle() }
  document.getElementById('complete').onclick = (e) => { e.preventDefault(); S.debugComplete(); e.currentTarget.textContent = `${tr.complete} ✓` }   // 看板と光の部屋を全部（記録に書く）
  document.getElementById('freeLoop').onclick = (e) => { e.preventDefault(); if (S.debugFreeLoop()) e.currentTarget.textContent = `${tr.freeLoop} ✓`; setDevOpen(false) }   // 最後の道: 渇愛が尽きた状態で、継ぎ目の少し手前へ（2026-11-08）
}
// Delete キーでも記録を消す（作っている間はよく使うので、確かめずに消す）。開発中だけ（2026-11-11。公開版では効かない）
if (DEBUG) addEventListener('keydown', (e) => {
  if (e.key !== 'Delete' || e.ctrlKey || e.metaKey || e.altKey) return
  e.preventDefault()
  S.reset()
})

const input = createInput()
// 曲: 道ごと（REALMS の bgm、無ければ道の名前）。解脱したら end を一度
const music = createMusic()
const lastBgm = { light: false, realm: null }   // 前のコマで光の部屋にいたか、どの道か（曲を続きから流すかを決める）
fit()

// ---- タイトルとメニュー（src/menu.js） ----
const menu = createMenu({ fb, renderer, game: { get: () => S, set: (g) => { S = g } }, hasSave, sfx: (n) => music.sfx(n) })
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (picker?.onKey(e, menu.mode === 'play' && !S.reading)) return
  menu.onKey(e)
})
const toScreen = (e) => { const b = canvas.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * W, ((e.clientY - b.top) / b.height) * H] }
canvas.addEventListener('click', (e) => menu.onClick(...toScreen(e)))
canvas.addEventListener('pointerdown', (e) => menu.onPointerDown(...toScreen(e)))

// デバッグ: ?at= の場所から始める（その道を開き、そのマスの下の床に立つ。溶岩や針の上には立たない。床が無ければそのマスに）
// 道のどこかへ飛ぶ（デバッグ）: その道を始めから作り、マス（tx, ty）の近くの立てる所へ。岩の中なら上の空いたマスへ
function jumpTo(realm, tx, ty) {
  S = createGame({ maps: MAPS, startRealm: realm })
  const w = S.world
  let top = ty
  while (top > ty - 12 && top > 0 && tileAt(w, tx, top) !== K.air) top--
  let fy = top
  while (fy < top + 12 && fy < w.h - 1 && !(tileAt(w, tx, fy) === K.air && isSolidKind(tileAt(w, tx, fy + 1)))) fy++
  if (fy >= top + 12 || fy >= w.h - 1) fy = top
  S.warp(tx * TILE + TILE / 2, (fy + 1) * TILE)
  menu.mode = 'play'
}
if (DEBUG && parseAt()) {
  const at = parseAt()
  if (MAPS[at.realm]) { const w = createGame({ maps: MAPS, startRealm: at.realm }).world, { tx, ty } = atTile(w, at); jumpTo(at.realm, tx, ty) }
}

// ---- ループ ----
const STEP = 1 / 60
let acc = 0, last = performance.now(), t = 0
const frame = (now) => {
  acc += Math.min(0.1, (now - last) / 1000)
  last = now
  while (acc >= STEP) {
    if (touch.active()) input.setTouch(touch.state())
    const inp = input.read()
    const playing = menu.mode === 'play'
    menu.step(inp, STEP)
    if (playing) {
      if (picker?.picking()) { t += STEP; acc -= STEP; continue }   // 場所を選んでいる間は止める
      S.fly = !!fly?.on() && !S.reading
      if (inp.pause) menu.pause()   // ゲームパッドの Select・Start でポーズ（2026-11-11。R・Select でその場で死ぬのはやめて、ポーズの「この生を終える」に）
      S.step(inp, T, STEP)
      if (S.player?.sfx) { music.sfx(S.player.sfx); S.player.sfx = null }   // 効果音（player.js が置く）
      while (S.sfx?.length) music.sfx(S.sfx.shift())   // 効果音（game.js が並べる）
      if (touch.active()) touch.setGrounded(!!(S.player?.onGround || S.player?.climb), STEP)   // スマホ: 着地したら、スティックの中心を止めるのをやめる
    }
    t += STEP
    acc -= STEP
  }
  // 光の部屋: 見つけるまでは曲なし（静けさ）。見つけたら（心が静まった・法を聞いた…）静かで荘厳な light（2026-11-06）
  const inLight = S.room?.light && !S.dead
  // 道の曲を続きから流すのは、同じ道の光の部屋から出たときだけ。ゲームを始めたとき・次の道へ進んだときなどは頭から（2026-11-07）
  const playing = menu.mode === 'play' || menu.mode === 'pause'   // ポーズの間も、曲は流したまま
  // 再び人: 輪が切れたら（「渇愛が、尽きた」）、曲を消して静かに。終わりの部屋で終わりの曲（end。フェードインせず、いきなり。src/music.js の NO_FADE_IN）（2026-11-08）
  music.play(!playing ? null : S.ending ? 'end' : S.loopRun?.freed ? null : inLight ? (S.found?.has(S.room.index) ? 'light' : null) : REALMS[S.realm]?.bgm ?? S.realm,
    { resume: playing && lastBgm.light && !inLight && lastBgm.realm === S.realm })
  if (playing) { lastBgm.light = inLight; lastBgm.realm = S.realm } else lastBgm.light = false
  S.touchUi = touch.active()   // 看板の窓の案内を、スマホの操作で書く
  if (menu.mode === 'play') { renderer.draw(S, t); picker?.draw(fb, t, 1 / 60) }
  else menu.draw(t)
  renderer.present(out32, PAL32, menu.mode === 'play')   // 光の層を足す（炎の照り返しなど。パレットに縛られない）。遊ぶ画面のときだけ
  ctx.putImageData(img, 0, 0)
  touch.setAlt(menu.mode !== 'play' || !!S.reading, S.reading || menu.windowOpen() ? tr.padClose : tr.padOk)   // タイトル・記録・看板の一覧では右側のボタンの字を「決定」、看板の窓では「閉じる」に
  touch.render()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
