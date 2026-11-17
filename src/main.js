// 入口: 入力（src/input.js）、ループ
import { REC, REPLAY, rec, rep } from './rec.js'   // いちばん先に（録る・再現するときは、乱数と記録の置き場を差しかえる。開発中だけ）
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
const fly = DEBUG && !REC && !REPLAY ? createFly((v) => { const a = document.getElementById('fly'); if (a) a.textContent = v ? `${tr.fly} ●` : tr.fly }) : null
// スマホのデバッグの並び（2026-11-07）: 板の左上の「デバッグ」で、PC と同じ並び（#keys。HTML のまま）を画面の上に重ねて開く・閉じる
let devOpen = false
const setDevOpen = (v) => { devOpen = v; fit() }
const touch = createTouchPad({ canvas, padCanvas: document.getElementById('pad'), W, H, labels: { dash: tr.padDash },
  // 板の左上の字のボタン: 開発中は「デバッグ」（記録を消す・場所をコピー・飛ぶは、デバッグの並びからたどる。2026-11-07）
  //   その横に「ポーズ」（2026-11-11。遊んでいる間だけ効く。Esc と同じ）
  //   公開版は「ポーズ」だけ（2026-11-11。「記録を消す」はタイトルの項目から）
  links: [...(DEBUG ? [{ label: tr.debugShort, on: () => setDevOpen(!devOpen), lit: () => devOpen || !!fly?.on() }] : []), { label: tr.pauseShort, on: () => menu.pause(), minW: textWidth(tr.debugShort) }] })   // ポーズはデバッグと同じ幅に
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
document.getElementById('keys').innerHTML = (DEBUG ? `<a href="#" id="devClose">${tr.debugClose}</a><a href="#" id="recLink">${REC ? tr.recOn : tr.rec}</a><a href="#" id="wipe">${tr.wipe}</a><a href="#" id="pick">${tr.pick}</a><a href="#" id="fly">${tr.fly}</a><a href="#" id="complete">${tr.complete}</a><a href="#" id="freeLoop">${tr.freeLoop}</a><a href="editor.html" id="editorLink">${tr.editor}</a><label id="devRealmBox">${tr.devRealm} <select id="devRealm"></select></label><label>${tr.devRoom} <select id="devRoom"></select></label>` : '')
// ステージエディタは、今いる道の地図で開く（2026-11-06。前はいつも地獄だった）
document.getElementById('editorLink')?.addEventListener('click', (e) => { e.currentTarget.href = `editor.html?map=${REALMS[S.realm]?.map ?? 'hell'}` })
// 画面の下の「記録を消す」は開発中だけ（2026-11-11。公開版では出さない。記録を消すのはタイトルの項目から）
if (DEBUG) document.getElementById('wipe').onclick = (e) => { e.preventDefault(); if (confirm(tr.wipeAsk)) S.reset() }
if (DEBUG) document.getElementById('pick').onclick = (e) => { e.preventDefault(); setDevOpen(false); startPick() }   // スマホでは、並びを閉じてから画面を指す
// 録画（開発中だけ。2026-11-14。src/rec.js）: 押すと読み直して、タイトルから録りはじめる。録っている間は、ほかのデバッグの項目を隠す（同じに再現できなくなるので）。もう一度押すと（F8 でも）保存
//   読み直すときは ?at= などを外す（同じ始まりから再現するため）。保存したあとにもう一度押すと、また新しく録る
if (DEBUG) document.getElementById('recLink').onclick = (e) => { e.preventDefault(); if (REC && !recDone) stopRec(); else { sessionStorage.setItem('reincarnation-rec', '1'); location.href = location.pathname } }
if (REC) for (const el of document.getElementById('keys').children) if (el.id !== 'recLink') el.style.display = 'none'
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
  document.getElementById('fly').onclick = (e) => { e.preventDefault(); fly?.toggle() }
  document.getElementById('complete').onclick = (e) => { e.preventDefault(); S.debugComplete(); e.currentTarget.textContent = `${tr.complete} ✓` }   // 看板と光の部屋を全部（記録に書く）
  document.getElementById('freeLoop').onclick = (e) => { e.preventDefault(); if (S.debugFreeLoop()) e.currentTarget.textContent = `${tr.freeLoop} ✓`; setDevOpen(false) }   // 最後の道: 渇愛が尽きた状態で、継ぎ目の少し手前へ（2026-11-08）
}
// Delete キーでも記録を消す（作っている間はよく使うので、確かめずに消す）。開発中だけ（2026-11-11。公開版では効かない）
if (DEBUG && !REC) addEventListener('keydown', (e) => {
  if (e.key !== 'Delete' || e.ctrlKey || e.metaKey || e.altKey) return
  e.preventDefault()
  S.reset()
})

const input = createInput()
// 曲: 道ごと（REALMS の bgm、無ければ道の名前）。解脱したら end を一度
// 再現するとき（動画づくり）は音を鳴らさず、曲と効果音を変えた時（コマの番号）だけ覚える。tools/video.mjs が音を組み立てる
const audioLog = []
let stepNo = 0
const music = REPLAY ? (() => { let want; return { play: (name, { resume = false } = {}) => { if (name === want) return; want = name; audioLog.push([stepNo, 'play', name ?? null, resume]) }, sfx: (n) => audioLog.push([stepNo, 'sfx', n]) } })() : createMusic()
const lastBgm = { light: false, realm: null }   // 前のコマで光の部屋にいたか、どの道か（曲を続きから流すかを決める）
fit()

// ---- タイトルとメニュー（src/menu.js） ----
const menu = createMenu({ fb, renderer, game: { get: () => S, set: (g) => { S = g } }, hasSave, sfx: (n) => music.sfx(n) })
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (REPLAY) return   // 再現するときは、録ったキーだけ（下のループで menu.onKey に渡す）
  if (REC && e.key === 'F8') { e.preventDefault(); stopRec(); return }
  if (!REC && picker?.onKey(e, menu.mode === 'play' && !S.reading)) return   // 録る間は、場所をコピー（C）・飛ぶ（F）を使わない
  rec?.key(stepNo, e)
  menu.onKey(e)
})
const toScreen = (e) => { const b = canvas.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * W, ((e.clientY - b.top) / b.height) * H] }
// フォーカス（2026-11-14）: itch.io などに埋め込むと、最初はページのほうにフォーカスがあって、キーが届かない。外れている間は「クリックすると、キーで遊べます」を出し、遊んでいたらポーズ。
//   外れているときのクリックは、フォーカスを戻すだけ（タイトルの項目を選んだりしない）。スマホ（指の操作）では出さない
let focusClick = false
const unfocused = () => !document.hasFocus() && !touch.active() && !REC && !REPLAY
addEventListener('blur', () => { if (REPLAY || touch.active()) return; rec?.blur(stepNo); menu.pause() })
// 録る・再現するときは、画面のクリックを使わない（キーだけで同じに再現するため）
canvas.addEventListener('pointerdown', (e) => { if (REC || REPLAY) return; focusClick = unfocused(); if (!focusClick) menu.onPointerDown(...toScreen(e)) })
canvas.addEventListener('click', (e) => { if (REC || REPLAY) return; if (focusClick) { focusClick = false; return } menu.onClick(...toScreen(e)) })

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
if (DEBUG && parseAt()) {   // 録る・再現するときも、?at= から始めてよい（録画に at を残し、再現にも付ける）
  const at = parseAt()
  if (MAPS[at.realm]) { const w = createGame({ maps: MAPS, startRealm: at.realm }).world, { tx, ty } = atTile(w, at); jumpTo(at.realm, tx, ty) }
}

// ---- ループ ----
const STEP = 1 / 60
let acc = 0, last = performance.now(), t = 0
// 1 コマ進める（1/60 秒）。録る・再現するときは、コマの番号（stepNo）で入力を覚える・引く
function simStep() {
  if (rep) {
    for (const k of rep.keys(stepNo)) menu.onKey({ key: k.key, code: k.code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: document.body, preventDefault() {} })
    if (rep.blur(stepNo)) menu.pause()
  }
  if (touch.active()) input.setTouch(touch.state())
  const inp = rep ? rep.inp(stepNo) : input.read()
  rec?.inp(stepNo, inp)
  const playing = menu.mode === 'play'
  menu.step(inp, STEP)
  if (playing && !picker?.picking()) {   // 場所を選んでいる間は止める
    S.fly = !!fly?.on() && !S.reading
    if (inp.pause) menu.pause()   // ゲームパッドの Select・Start でポーズ（2026-11-11。R・Select でその場で死ぬのはやめて、ポーズの「この生を終える」に）
    S.step(inp, T, STEP)
    if (S.player?.sfx) { music.sfx(S.player.sfx); S.player.sfx = null }   // 効果音（player.js が置く）
    while (S.sfx?.length) music.sfx(S.sfx.shift())   // 効果音（game.js が並べる）
    if (touch.active()) touch.setGrounded(!!(S.player?.onGround || S.player?.climb), STEP)   // スマホ: 着地したら、スティックの中心を止めるのをやめる
  }
  t += STEP
  stepNo++
  rec?.check(stepNo, S, menu.mode)
}
// 画面を描き、曲を決める（コマを進めたあと）
function drawFrame() {
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
  if (unfocused()) menu.drawFocus(t)
  renderer.present(out32, PAL32, menu.mode === 'play')   // 光の層を足す（炎の照り返しなど。パレットに縛られない）。遊ぶ画面のときだけ
  ctx.putImageData(img, 0, 0)
  touch.setAlt(menu.mode !== 'play' || !!S.reading, S.reading || menu.windowOpen() ? tr.padClose : tr.padOk)   // タイトル・記録・看板の一覧では右側のボタンの字を「決定」、看板の窓では「閉じる」に
  touch.render()
}
const frame = (now) => {
  acc += Math.min(0.1, (now - last) / 1000)
  last = now
  while (acc >= STEP) { simStep(); acc -= STEP }
  drawFrame()
  requestAnimationFrame(frame)
}

// ---- 録る（デバッグの並びの「録画」。開発中だけ）: もう一度押すか F8 で、録り終えて rec/<名前>.json に保存 ----
let recDone = false
async function stopRec() {
  if (recDone) return
  recDone = true
  const link = document.getElementById('recLink')
  link.textContent = tr.recSaving
  const name = await rec.save(stepNo)
  link.textContent = name ? tr.recSaved(name, (stepNo / 60).toFixed(1)) : tr.recFail
}

// ---- 再現する（?replay=<名前>。開発中だけ）: ループは回さず、tools/video.mjs が 1 コマずつ進めて画面を取り出す ----
if (REPLAY) {
  const bytes = new Uint8Array(img.data.buffer)
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s) }
  const misses = []
  window.__rep = {
    steps: rep.steps, firstKey: rep.firstKey, W, H, audioLog, misses,
    // n コマ進める。grab なら、コマごとの画面（RGBA、W×H×4）をつないだ base64 を返す
    run(n, grab) {
      const out = grab ? new Uint8Array(n * W * H * 4) : null
      for (let i = 0; i < n; i++) {
        simStep()
        const m = rep.check(stepNo, S, menu.mode)
        if (m && misses.length < 20) misses.push(m)
        drawFrame()
        if (out) out.set(bytes, i * W * H * 4)
      }
      return out ? b64(out) : null
    },
  }
  drawFrame()
} else requestAnimationFrame(frame)
