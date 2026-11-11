// ステージエディタ（editor.html。npm run dev のときだけ使える）
// 地図のファイル（src/maps/<名前>.json）を読み、タイルを置き、その場で遊んで確かめ、保存する
// 部屋は画面の升目（横 20・縦 15 タイル）にそろえる。部屋の無い画面にタイルを置くと、一画面の部屋ができる
import { ALL_HEX } from './shade.js'
import { P } from './palette.js'
import { buildWorld, TILE, K, roomAt, tileAt, isSolidKind, LOOP_COPY } from './world.js'
import { createGame } from './game.js'
import { createRenderer, W, H } from './render.js'
import { DEFAULTS as T } from './tune.js'
import { createInput } from './input.js'
import { REALMS } from './realms.js'
import { placeLine, copyText } from './debug.js'
import { placedSigns, SUTTA_SITE, openSignPage } from './signs.js'
import { LANG } from './i18n.js'

const MAP = new URLSearchParams(location.search).get('map') || 'hell'
// 地図のファイルの名前から道を引く（再び人は、ファイルが last、道が human2）
const REALM = Object.entries(REALMS).find(([, v]) => v.map === MAP)?.[0] ?? MAP
// 道を替える（見出しの選ぶ欄。2026-11-06）: 地図のファイルごとに一つ。替えるとページを開き直す
{
  const names = { hell: '地獄', animal: '畜生', peta: '餓鬼', human: '人', deva: '天', last: '再び人' }
  const sel = document.getElementById('mapSel')
  for (const m of [...new Set(Object.values(REALMS).map((v) => v.map))]) sel.append(Object.assign(document.createElement('option'), { value: m, textContent: names[m] ?? m }))
  sel.value = MAP
  sel.addEventListener('change', () => { location.href = `editor.html?map=${sel.value}` })   // 保存していない編集は、beforeunload で確かめる
}
const SW = 20, SH = 15
const DRAFT_KEY = `reincarnation-editor-draft-${MAP}`

// タイル（記号は world.js の先頭）
const TOOLS = [
  { ch: '#', name: '岩', key: '1' },
  { ch: '.', name: '空', key: '2' },
  { ch: '~', name: '炎', names: { animal: '水', peta: '血の川', human: '川' }, key: '3' },
  { ch: '^', name: '針 上', names: { animal: '棘 上', human: '棘 上' }, key: '4' },
  { ch: 'v', name: '針 下', names: { animal: '棘 下', human: '棘 下' }, key: '5' },
  { ch: '>', name: '針 右', names: { animal: '棘 右', human: '棘 右' }, key: '6' },
  { ch: '<', name: '針 左', names: { animal: '棘 左', human: '棘 左' }, key: '7' },
  { ch: 'F', name: '噴き出し', realms: ['hell'], key: '8' },
  { ch: 'H', name: 'すり抜け', key: '9' },
  { ch: 'L', name: 'すり抜けの炎', names: { animal: 'すり抜けの水', peta: 'すり抜けの血の川', human: 'すり抜けの川' }, key: 'u' },
  { ch: 'D', name: '扉', key: '0' },
  { ch: 'S', name: 'はじまり', key: '-' },
  { ch: 'E', name: '鳥', realms: ['animal'], key: 'q' },
  { ch: 'P', name: '魚（水の中）', realms: ['animal'], key: 'e' },
  { ch: 'N', name: '蛇', realms: ['animal'], key: 'f' },
  { ch: 'W', name: '熱い風', realms: ['peta'], key: 'h' },
  { ch: 'Y', name: '布施人', realms: ['peta'], key: 'j' },
  { ch: 'Q', name: 'サーリプッタ', realms: ['peta'], key: 'k' },
  { ch: 'O', name: '食べ物', realms: ['peta'], key: 'r' },
  { ch: 'M', name: '町の人', realms: ['peta', 'human'], key: 't' },
  { ch: 'G', name: '施す食べ物', realms: ['human'], key: 'y' },
  { ch: 'C', name: '崩れる岩', realms: ['human'], key: 'g' },
  { ch: 'R', name: '転がる岩', realms: ['human'], key: 'n' },
  { ch: 'T', name: '誘うもの', realms: ['human2'], key: 'i' },
  { ch: 'B', name: '看板', key: 'o' },
  { ch: 'b', name: '岩の中の看板', key: 'p' },
]
// realms: そのタイルを出す道（無ければどの道でも。2026-11-05。生き物や仕掛けは道の筋書きに結びついているので、その道だけに）。names: 道ごとの呼び名
const toolsHere = () => TOOLS.filter((t) => !t.realms || t.realms.includes(REALM))
const toolName = (t) => t.names?.[REALM] ?? t.name
const $ = (id) => document.getElementById(id)
const SELECT = 'select'   // 選ぶ道具（タイルではない）
// 画面の上で印を付けるタイル（見た目では分からないもの）: すり抜け・扉・はじまり・生き物
const MARK = { H: '255,122,217', b: '255,122,217', L: '255,122,217', D: '95,224,208', S: '255,224,102', E: '255,241,168', P: '168,216,255', N: '154,209,96', O: '240,140,46', W: '255,110,60', Y: '120,230,160', Q: '255,190,90', M: '230,230,240', G: '255,200,90', T: '240,120,200', R: '200,190,180' }

// ---- 画面 ----
const canvas = $('c'), ctx = canvas.getContext('2d')
const over = $('o'), octx = over.getContext('2d')
const img = ctx.createImageData(W, H)
const out32 = new Uint32Array(img.data.buffer)
const fb = new Uint8Array(W * H)
const renderer = createRenderer(fb)
const PAL32 = new Uint32Array(256)
ALL_HEX.forEach((h, i) => { const n = parseInt(h, 16); PAL32[i] = 0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16) })
const hexOf = (i) => `#${ALL_HEX[i]}`
let scale = 1
// 画面の窓の中に、縦横の比を保って収める（大きさは自由。整数倍でなくてよい）
//   画面のまわりに EDGE ドット（2 マス）、となりの部屋をうっすら出す（つながりが分かるように。2026-11-05）
const EDGE = 2 * 16
const edge = $('edge'), ectx = edge.getContext('2d')
edge.width = W + EDGE * 2; edge.height = H + EDGE * 2
const edgeImg = ectx.createImageData(edge.width, edge.height), edge32 = new Uint32Array(edgeImg.data.buffer)
function fit() {
  const box = $('viewBox'), bw = box.clientWidth - 8, bh = box.clientHeight - 8
  if (bw <= 0 || bh <= 0) return
  scale = Math.max(0.5, Math.min(bw / (W + EDGE * 2), bh / (H + EDGE * 2)))
  const cw = Math.floor(W * scale), ch = Math.floor(H * scale)
  scale = cw / W
  for (const c of [canvas, over]) { c.style.width = `${cw}px`; c.style.height = `${ch}px` }
  over.width = cw; over.height = ch
  const m = Math.round(EDGE * scale)
  $('stack').style.margin = `${m}px`
  Object.assign(edge.style, { left: `${-m}px`, top: `${-m}px`, width: `${cw + m * 2}px`, height: `${ch + m * 2}px` })
  if (typeof placeArrows === 'function') placeArrows()
}
// となりの画面へ移る（矢印キー・WASD と、まわりの矢印）
function moveCam(dx, dy) {
  cam.cx = Math.max(-1, Math.min(world.w / SW, cam.cx + dx))
  cam.cy = Math.max(-1, Math.min(world.h / SH, cam.cy + dy))
  showRoom()
}
// まわりの矢印: 上下左右のまん中に。押すとその向きの画面へ。その向きの画面に部屋があるときだけ明るく
const ARROWS = [['◀', -1, 0], ['▶', 1, 0], ['▲', 0, -1], ['▼', 0, 1]].map(([label, dx, dy]) => {
  const b = Object.assign(document.createElement('button'), { textContent: label, className: 'edgeArrow' })
  b.addEventListener('click', () => { if (mode === 'edit') moveCam(dx, dy) })
  $('stack').append(b)
  return { b, dx, dy }
})
function placeArrows() {
  const m = Math.round(EDGE * scale), cw = W * scale, ch = H * scale
  for (const { b, dx, dy } of ARROWS) {
    Object.assign(b.style, { left: `${dx < 0 ? -m / 2 : dx > 0 ? cw + m / 2 : cw / 2}px`, top: `${dy < 0 ? -m / 2 : dy > 0 ? ch + m / 2 : ch / 2}px` })
    // その向きの画面に部屋があるか
    const has = world && rooms.some((r) => { const x0 = (cam.cx + dx) * SW, y0 = (cam.cy + dy) * SH; return r.x < x0 + SW && r.x + r.rows[0].length > x0 && r.y < y0 + SH && r.y + r.rows.length > y0 })
    b.classList.toggle('has', !!has)
    b.style.visibility = mode === 'edit' ? '' : 'hidden'
  }
}
// ---- 看板の窓（2026-11-05）: 「選ぶ」で看板のマスを押すと開く。どの文にするかと、文の中身（日本語・英語の行と出典、メモ、原典のページ）を直す。
//   保存は看板の文（src/signs.json）だけ。地図の保存（Ctrl+S）とは別
let signAt = null   // { ri, key: "x,y" }
function openSign(tx, ty) {
  const ri = roomIndexAt(tx, ty)
  if (ri < 0) return
  const r = rooms[ri]
  // 窓の中の欄にカーソルが残っていると、その欄は書き換えない（書いている途中を守る）ので、別の看板を開く前に外す（2026-11-07。前の看板の文のままになっていた）
  if ($('signWin').contains(document.activeElement)) document.activeElement.blur()
  signAt = { ri, key: `${tx - r.x},${ty - r.y}` }
  $('signWin').style.display = ''
  $('signWin').style.zIndex = String(++floatTop)
  showSign()
}
const signDirty = () => JSON.stringify(signs) !== signsSaved
function showSign() {
  if (!signAt || $('signWin').style.display === 'none') return
  const r = rooms[signAt.ri]
  if (!r || r.rows[+signAt.key.split(',')[1]]?.[+signAt.key.split(',')[0]] !== 'B' && r.rows[+signAt.key.split(',')[1]]?.[+signAt.key.split(',')[0]] !== 'b') { $('signWin').style.display = 'none'; signAt = null; return }
  const id = r.signs?.[signAt.key] || ''
  $('signWhere').textContent = `部屋 ${signAt.ri}「${r.name}」(${signAt.key.replace(',', ', ')}) の看板`
  const sel = $('signId')
  if (document.activeElement !== sel) {
    const used = usedSigns(), ids = Object.keys(signs)
    sel.innerHTML = ''
    const opt = (v, label) => sel.append(Object.assign(document.createElement('option'), { value: v, textContent: label }))
    opt('', '（文を選ぶ）')
    for (const k of [...ids.filter((i) => !used.has(i) || i === id), ...ids.filter((i) => used.has(i) && i !== id)]) opt(k, (used.has(k) && k !== id ? '（置いてある）' : '') + signTitle(k))
    sel.value = id
  }
  $('signBody').style.display = id ? '' : 'none'
  $('signState').textContent = signDirty() ? '● 保存していない変更あり' : '保存済み'
  $('signState').className = signDirty() ? 'dirty' : 'muted'
  if (!id) return
  const d = signs[id], f = (el, v) => { if (document.activeElement !== $(el)) $(el).value = v ?? '' }
  f('signNote', d.note); f('signPage', d.page)
  f('signJa', (d.ja?.lines || []).join('\n')); f('signJaSrc', d.ja?.source)
  f('signEn', (d.en?.lines || []).join('\n')); f('signEnSrc', d.en?.source)
  const url = d.page ? `${SUTTA_SITE}/ja/${d.page}` : ''
  $('signLink').href = url || '#'; $('signLink').textContent = url || '（ページなし）'
  // 長すぎる行（日本語 30 字、英語 48 字くらいまで。窓からはみ出す）
  const over = [...(d.ja?.lines || []).filter((l) => [...l].length > 30).map(() => '日本語'), ...(d.en?.lines || []).filter((l) => l.length > 48).map(() => 'English')]
  $('signWarn').textContent = over.length ? `長すぎる行: ${[...new Set(over)].map((k) => `${k} ${over.filter((x) => x === k).length} 行`).join('、')}（日本語 30 字・英語 48 字くらいまで）` : ''
}
// 文を選ぶ（地図の編集。undo できる）
$('signId').addEventListener('change', (e) => {
  if (!signAt) return
  const v = e.target.value, key = signAt.key
  commit()
  const r = rooms[signAt.ri]
  if (v) (r.signs ||= {})[key] = v; else if (r.signs) { delete r.signs[key]; if (!Object.keys(r.signs).length) delete r.signs }
  rebuild(); showSign()
})
$('signNew').addEventListener('click', () => {
  const id = (prompt('新しい文の番号（英小文字・数字・_。例: ashes）') || '').trim()
  if (!id) return
  if (!/^[a-z0-9_]+$/.test(id)) { alert('番号は英小文字・数字・_ だけ'); return }
  if (signs[id]) { alert(`${id} はもうある`); return }
  signs[id] = { note: '', page: '', ja: { lines: [], source: '' }, en: { lines: [], source: '' } }
  $('signId').blur(); showSign()
  $('signId').value = id; $('signId').dispatchEvent(new Event('change'))
})
// 文の中身を直す（看板の文の保存まで、ファイルには書かない）
const signEdit = (fn) => () => { const id = rooms[signAt?.ri]?.signs?.[signAt.key]; if (!id) return; fn(signs[id]); showSign() }
const lines = (v) => v.split('\n').map((l) => l.trimEnd()).filter((l, i, a) => l || i < a.length - 1)
$('signNote').addEventListener('input', signEdit((d) => (d.note = $('signNote').value)))
$('signPage').addEventListener('input', signEdit((d) => (d.page = $('signPage').value.trim())))
$('signJa').addEventListener('input', signEdit((d) => ((d.ja ||= {}).lines = lines($('signJa').value))))
$('signJaSrc').addEventListener('input', signEdit((d) => ((d.ja ||= {}).source = $('signJaSrc').value)))
$('signEn').addEventListener('input', signEdit((d) => ((d.en ||= {}).lines = lines($('signEn').value))))
$('signEnSrc').addEventListener('input', signEdit((d) => ((d.en ||= {}).source = $('signEnSrc').value)))
$('signSave').addEventListener('click', async () => {
  const res = await fetch('/__signs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(signs) })
  if (!res.ok) { alert(`看板の文を保存できませんでした: ${await res.text()}`); return }
  signsSaved = JSON.stringify(signs); showSign(); showProblems(); toast('看板の文を保存しました（src/signs.json）')
})
$('signRevert').addEventListener('click', () => { if (!signDirty() || !confirm('看板の文の、保存していない変更を捨てますか？')) return; signs = JSON.parse(signsSaved); for (const el of ['signNote', 'signPage', 'signJa', 'signJaSrc', 'signEn', 'signEnSrc']) $(el).blur(); showSign() })
function closeSign() { if ($('signWin').contains(document.activeElement)) document.activeElement.blur(); $('signWin').style.display = 'none'; signAt = null }
$('signClose').addEventListener('click', closeSign)
addEventListener('beforeunload', (e) => { if (signDirty()) e.preventDefault() })

// まわりを描く: 画面を 4 回（左上・右上・左下・右下へ EDGE ずらして）描いて、つなぎ合わせる
function drawEdge(c, t) {
  for (const oy of [-EDGE, EDGE]) for (const ox of [-EDGE, EDGE]) {
    const cc = { x: c.x + ox, y: c.y + oy }
    renderer.draw({ world, cam: cc, room: roomAt(world, cc.x + W / 2, cc.y + H / 2), player: null, dead: null, flowers: [], petals: [], time: t }, t, { hud: false })
    for (let y = 0; y < H; y++) { const ey = y + oy + EDGE; for (let x = 0; x < W; x++) edge32[ey * edge.width + x + ox + EDGE] = PAL32[fb[y * W + x]] }
  }
  ectx.putImageData(edgeImg, 0, 0)
  // まわりの帯にも、見た目では分からないタイルの印（すり抜け・扉・はじまり・生き物など。2026-11-07。前は真ん中の画面だけだった）
  const t0x = c.x / TILE, t0y = c.y / TILE, n = EDGE / TILE
  ectx.font = 'bold 11px sans-serif'; ectx.textAlign = 'center'; ectx.textBaseline = 'middle'
  for (let ty = t0y - n; ty < t0y + SH + n; ty++) for (let tx = t0x - n; tx < t0x + SW + n; tx++) {
    if (tx >= t0x && tx < t0x + SW && ty >= t0y && ty < t0y + SH) continue   // 真ん中の画面は drawOverlay が描く
    if (roomIndexAt(tx, ty) < 0) continue
    const ch = charAt(tx, ty), col = MARK[ch]
    if (!col || (TERRAIN.has(ch) && loopCopyAt(tx, ty))) continue
    const x = (tx - t0x) * TILE + EDGE, y = (ty - t0y) * TILE + EDGE
    if (ch === 'H' || ch === 'D' || ch === 'b') { ectx.fillStyle = `rgba(${col},0.28)`; ectx.fillRect(x, y, TILE, TILE) }
    ectx.strokeStyle = `rgb(${col})`; ectx.lineWidth = 1; ectx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1)
    ectx.fillStyle = `rgb(${col})`; ectx.fillText(ch, x + TILE / 2, y + TILE / 2)
  }
}

// ---- 地図の中身 ----
let rooms = []          // { name, x, y, light?, note?, rows }
let world = null        // rooms を組み立てたもの（描画と、遊ぶとき）
let savedText = ''      // 最後に保存した（読んだ）中身
const cam = { cx: 1, cy: 3 }   // 見ている画面（升目）
let tool = SELECT   // はじめは「選ぶ」
let grid = false
const history = [], future = []

const snapshot = () => JSON.stringify(rooms)
const dirty = () => snapshot() !== savedText
const roomIndexAt = (tx, ty) => rooms.findIndex((r) => tx >= r.x && ty >= r.y && tx < r.x + r.rows[0].length && ty < r.y + r.rows.length)

// 部屋が左や上にはみ出したら、全体を升目単位でずらす（地図は 0 から始まる）
function normalize() {
  const minX = Math.min(0, ...rooms.map((r) => r.x)), minY = Math.min(0, ...rooms.map((r) => r.y))
  if (minX < 0 || minY < 0) {
    for (const r of rooms) { r.x -= minX; r.y -= minY }
    cam.cx -= minX / SW; cam.cy -= minY / SH
    if (stroke) stroke.last = [stroke.last[0] - minX, stroke.last[1] - minY]
  }
}
function rebuild() {
  normalize()
  world = buildWorld(rooms, { strict: false, realm: REALM })
  drawMiniBase()
  showProblems()
  showRoom()
  showStatus()
  if (typeof showSign === 'function') showSign()
  try { if (dirty()) localStorage.setItem(DRAFT_KEY, snapshot()); else localStorage.removeItem(DRAFT_KEY) } catch {}
}
function commit() { history.push(snapshot()); if (history.length > 300) history.shift(); future.length = 0 }
function undo() { if (!history.length) return; future.push(snapshot()); rooms = JSON.parse(history.pop()); rebuild() }
// 破棄: 保存していない編集を捨てて、保存した所（ファイルの中身）に戻す
function discard() {
  if (!dirty() || !confirm('保存していない編集を捨てて、保存した所に戻しますか？')) return
  rooms = JSON.parse(savedText); rebuild(); toast('保存した所に戻しました')
}
function redo() { if (!future.length) return; history.push(snapshot()); rooms = JSON.parse(future.pop()); rebuild() }

// 一マス置く。部屋の無い画面なら、岩で埋めた一画面の部屋を作ってから（消すときは作らない）
// 輪の道（再び人）の写しの場所（2026-11-07）: 地形は地図を組み立てるときに自動でそろえるので、ここには置けない（元の場所を直す）。
//   { from: 写しの元の列（地図のマス）} か null。看板・誘うものなど地形でないものは置ける
function loopCopyAt(tx, ty) {
  for (const r of rooms) {
    if (!r.loop || ty < r.y || ty >= r.y + r.rows.length) continue
    const x0 = r.x + (r.loopStart || 0), L = r.loop
    if (tx >= x0 - LOOP_COPY && tx < x0 && tx >= r.x) return { from: tx + L }
    if (tx >= x0 + L && tx < x0 + L + LOOP_COPY && tx < r.x + r.rows[0].length) return { from: tx - L }
  }
  return null
}
const TERRAIN = new Set(['#', '.', '~', '^', 'v', '>', '<', 'F', 'H', 'D', 'L', 'C'])
let copyWarned = 0
function setTile(tx, ty, ch, { create = true } = {}) {
  const lc = loopCopyAt(tx, ty)
  if (lc && TERRAIN.has(ch)) { if (performance.now() - copyWarned > 1500) { copyWarned = performance.now(); toast(`ここは写しの場所（地形は ${lc.from - (rooms.find((r) => r.loop)?.x ?? 0)} 列目から自動でそろえる）。元の場所を直してください`) } return false }
  let ri = roomIndexAt(tx, ty)
  if (ri < 0) {
    if (!create) return false
    const sx = Math.floor(tx / SW), sy = Math.floor(ty / SH)
    rooms.push({ name: '新しい部屋', x: sx * SW, y: sy * SH, rows: Array.from({ length: SH }, () => '#'.repeat(SW)) })
    ri = rooms.length - 1
  }
  const r = rooms[ri], i = tx - r.x, j = ty - r.y
  if (r.rows[j][i] === ch) return false
  // はじまりは一つだけ
  if (ch === 'S') for (const o of rooms) o.rows = o.rows.map((row) => row.replaceAll('S', '.'))
  // 看板を消したら、その看板の番号も消す
  if ((r.rows[j][i] === 'B' || r.rows[j][i] === 'b') && r.signs && ch !== 'B' && ch !== 'b') { delete r.signs[`${i},${j}`]; if (!Object.keys(r.signs).length) delete r.signs }
  // 布施人を消したら、その結びつきも消す
  { const f = LINK_OF[r.rows[j][i]]; if (f && r[f] && LINK_OF[ch] !== f) { delete r[f][`${i},${j}`]; if (!Object.keys(r[f]).length) delete r[f] } }   // 布施人・施す食べ物を消したら、その結びつきも消す
  r.rows[j] = r.rows[j].slice(0, i) + ch + r.rows[j].slice(i + 1)
  return true
}
const charAt = (tx, ty) => { const ri = roomIndexAt(tx, ty); if (ri < 0) return null; const r = rooms[ri]; return r.rows[ty - r.y][tx - r.x] }

// ---- 読む・保存する ----
// 看板の文（src/signs.json）と、ほかの道の地図に置いてある看板（まだ置いていない文を数えるため）
let signs = {}, signsSaved = '{}', signsElsewhere = new Set()
async function loadSigns() {
  signs = await (await fetch('/__signs')).json(); signsSaved = JSON.stringify(signs)
  const others = await Promise.all(Object.entries(REALMS).filter(([r, v]) => r !== REALM && v.map).map(([, v]) => fetch(`/__map/${v.map}`).then((x) => (x.ok ? x.json() : { rooms: [] }))))
  signsElsewhere = new Set(others.flatMap((d) => placedSigns(d.rooms || [])))
}
async function load() {
  if (!world) await loadSigns()
  const res = await fetch(`/__map/${MAP}`)
  if (!res.ok) { alert(`地図 ${MAP} を読めませんでした（npm run dev で開いていますか）`); return }
  const data = await res.json()
  rooms = data.rooms
  savedText = snapshot()
  if (world) { rebuild(); return }   // 読み直し（ファイルが外で変わった）
  const draft = localStorage.getItem(DRAFT_KEY)
  if (draft && draft !== savedText && confirm('保存していない編集が残っています。戻しますか？（いいえなら捨てる）')) rooms = JSON.parse(draft)
  const s = rooms.find((r) => r.rows.some((row) => row.includes('S')))
  if (s) { cam.cx = Math.floor(s.x / SW); cam.cy = Math.floor(s.y / SH) }
  rebuild()
}
// 保存するとき、輪の道の写しの場所の地形を、元の場所からそろえて書く（地図のファイルもゲームと同じにする）。
//   写しの場所の看板・誘うものなど地形でないものは、そのまま残す。元の場所の地形でないもの（誘うものなど）は、写しでは空にする
function syncLoopCopies() {
  for (const r of rooms) {
    if (!r.loop) continue
    const x0 = (r.loopStart || 0), L = r.loop, w = r.rows[0].length
    r.rows = r.rows.map((row) => {
      const a = [...row]
      for (let i = 0; i < LOOP_COPY; i++) for (const [dst, src] of [[x0 - LOOP_COPY + i, x0 + L - LOOP_COPY + i], [x0 + L + i, x0 + i]]) {
        if (dst < 0 || dst >= w || src < 0 || src >= w) continue
        if (!TERRAIN.has(a[dst])) continue                     // 看板など（地形でないもの）は消さない
        a[dst] = TERRAIN.has(row[src]) ? row[src] : '.'
      }
      return a.join('')
    })
  }
}
async function save() {
  syncLoopCopies(); rebuild()
  const bad = world.problems.filter((p) => /光の部屋の番号|に番号（no）が無い/.test(p))   // 光の部屋の番号の重なり・抜けは保存しない（ゲームが地図を読めなくなる。2026-11-08）
  if (bad.length) { alert(`保存できません。光の部屋の番号を直してください:\n${bad.join('\n')}`); return }
  const res = await fetch(`/__map/${MAP}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rooms }) })
  if (!res.ok) { alert(`保存できませんでした: ${await res.text()}`); return }
  savedText = snapshot()
  try { localStorage.removeItem(DRAFT_KEY) } catch {}
  showStatus('保存しました')
}
// ファイルが外で（Claude などが）直されたら、読み直す。保存していない編集があるときは聞く
import.meta.hot?.on('map-changed', async ({ name }) => {
  if (name !== MAP) return
  const text = JSON.stringify((await (await fetch(`/__map/${MAP}`)).json()).rooms)
  if (text === savedText) return   // 自分で保存したもの
  if (dirty() && !confirm('地図のファイルが外で直されました。読み直しますか？（保存していない編集は消えます）')) return
  if (dirty()) commit()   // 読み直す前の編集はundo で戻せる
  await load()
  toast('ファイルが直されたので、読み直しました')
})

// 場所を、頼みごとに貼れる一行で写す（ゲームの「場所をコピー」と同じ形。src/debug.js の placeLine）
//   例: 地獄 #4「熱灰の淵」 (16, 10)〜(17, 14) 2×5 マス  http://…/?at=hell:4:16,10
//   「選ぶ」の道具で、押した 1 マスかなぞった範囲（2026-11-05 に C キーはやめた）
const gameUrl = () => new URL('./', location.href).href
function copyPlace(ax, ay, bx, by) {
  const g = { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) }
  const l = placeLine(REALM, rooms, roomIndexAt(g.x0, g.y0), g, gameUrl())
  copyText(l.full); toast(`写しました: ${l.short}`)
}
const copySel = () => sel && copyPlace(...sel.a, ...sel.b)
// 選んだのが看板の 1 マスなら看板の窓を開き、ほかのものを選んだら閉じる（2026-11-07）
const pickSign = () => { if (sel && sel.a[0] === sel.b[0] && sel.a[1] === sel.b[1] && 'Bb'.includes(charAt(...sel.a) || '_')) openSign(...sel.a); else closeSign() }

// ---- 選んだ範囲を動かす（2026-11-06。「選ぶ」の道具で、選んだ範囲の中をつかんで引きずる）----
//   元の所は空（.）になる。看板の文（部屋の signs）も一緒に動く（ほかの部屋へ動かせば、その部屋の signs へ）。
//   動かす先が部屋の外、または動かす先に（動かさない）看板があるときは、動かさない（看板の文の割り当てが消えないように）
const selRange = () => ({ x0: Math.min(sel.a[0], sel.b[0]), y0: Math.min(sel.a[1], sel.b[1]), x1: Math.max(sel.a[0], sel.b[0]), y1: Math.max(sel.a[1], sel.b[1]) })
const inSel = (tx, ty) => { if (!sel) return false; const g = selRange(); return tx >= g.x0 && tx <= g.x1 && ty >= g.y0 && ty <= g.y1 }
const inRange = (g, tx, ty) => tx >= g.x0 && tx <= g.x1 && ty >= g.y0 && ty <= g.y1
// 動かせない先のマス: [{ tx, ty, why: 'out' | 'sign' }]
function moveBad(g, dx, dy) {
  const bad = []
  for (let ty = g.y0; ty <= g.y1; ty++) for (let tx = g.x0; tx <= g.x1; tx++) {
    if (roomIndexAt(tx, ty) < 0) continue   // 元が部屋の外のマスは運ばない
    const nx = tx + dx, ny = ty + dy, ch = charAt(nx, ny)
    if (ch == null) bad.push({ tx: nx, ty: ny, why: 'out' })
    else if ((ch === 'B' || ch === 'b') && !inRange(g, nx, ny)) bad.push({ tx: nx, ty: ny, why: 'sign' })
  }
  return bad
}
// 一マスを書き換える（setTile と違い、はじまりの一つだけの決まりや看板の番号には触れない）
function putRaw(tx, ty, ch) {
  const r = rooms[roomIndexAt(tx, ty)], i = tx - r.x, j = ty - r.y
  r.rows[j] = r.rows[j].slice(0, i) + ch + r.rows[j].slice(i + 1)
}
function moveTiles(g, dx, dy) {
  commit()
  const cells = []
  for (let ty = g.y0; ty <= g.y1; ty++) for (let tx = g.x0; tx <= g.x1; tx++) {
    const ri = roomIndexAt(tx, ty)
    if (ri < 0) continue
    const r = rooms[ri], key = `${tx - r.x},${ty - r.y}`
    cells.push({ tx, ty, ch: charAt(tx, ty), id: r.signs?.[key], link: r.donors?.[key], gift: r.gifts?.[key] })
    if (r.signs && key in r.signs) delete r.signs[key]
    if (r.donors && key in r.donors) delete r.donors[key]   // 布施人・施す食べ物の結びつきも一緒に動く（2026-11-08）
    if (r.gifts && key in r.gifts) delete r.gifts[key]
    putRaw(tx, ty, '.')
  }
  for (const c of cells) {
    const nx = c.tx + dx, ny = c.ty + dy, r = rooms[roomIndexAt(nx, ny)]
    putRaw(nx, ny, c.ch)
    if (c.id) (r.signs ||= {})[`${nx - r.x},${ny - r.y}`] = c.id
    if (c.link) (r.donors ||= {})[`${nx - r.x},${ny - r.y}`] = c.link
    if (c.gift) (r.gifts ||= {})[`${nx - r.x},${ny - r.y}`] = c.gift
  }
  for (const r of rooms) { if (r.signs && !Object.keys(r.signs).length) delete r.signs; if (r.donors && !Object.keys(r.donors).length) delete r.donors; if (r.gifts && !Object.keys(r.gifts).length) delete r.gifts }
  rebuild()
}
const roomRef = (ri) => placeLine(REALM, rooms, ri, { x0: rooms[ri].x, y0: rooms[ri].y, x1: rooms[ri].x, y1: rooms[ri].y }, gameUrl()).short.replace(/ \(0, 0\)$/, '')
let toastTimer = 0
function toast(msg) { const el = $('toast'); el.textContent = msg; el.style.opacity = 1; clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.style.opacity = 0), 2200) }
$('copy').onclick = () => { const ri = curRoomIndex(); if (ri >= 0) { copyText(roomRef(ri)); toast(`写しました: ${roomRef(ri)}`) } }

addEventListener('beforeunload', (e) => { if (dirty()) e.preventDefault() })

// ---- 横の欄 ----
function showStatus(msg) {
  const st = $('status')
  st.textContent = `src/maps/${MAP}.json　部屋 ${rooms.length}　` + (msg || (dirty() ? '● 保存していない編集あり' : '保存済み'))
  st.className = dirty() ? 'dirty' : ''
  $('undo').disabled = !history.length
  $('redo').disabled = !future.length
  $('discard').disabled = !dirty()
}
function showProblems() {
  $('problems').innerHTML = ''
  const add = (t, info) => { const li = document.createElement('li'); li.textContent = t; if (info) li.className = 'info'; $('problems').append(li) }
  for (const p of world.problems) add(p)
  for (const p of world.warnings || []) add(p)
  // 看板: 文の決まっていない看板、同じ文が二か所、まだどこにも置いていない文（これは知らせだけ）
  rooms.forEach((r, ri) => r.rows.forEach((row, y) => [...row].forEach((c, x) => { if ((c === 'B' || c === 'b') && !r.signs?.[`${x},${y}`]) add(`看板の文が決まっていない: 部屋 ${ri}「${r.name}」(${x}, ${y})`) })))
  const used = usedSigns()
  for (const [id, at] of used) { if (at.length > 1) add(`同じ看板 ${id} が ${at.length} か所: ${at.join('、')}`); if (!signs[id]) add(`src/signs.json に無い看板 ${id}: ${at.join('、')}`) }
  const unused = Object.keys(signs).filter((id) => !used.has(id) && !signsElsewhere.has(id))
  if (unused.length) add(`まだ置いていない看板（${unused.length}）: ${unused.join('、')}`, true)
}
const curRoomIndex = () => roomIndexAt(cam.cx * SW, cam.cy * SH)
function showRoom() {
  placeArrows()
  const ri = curRoomIndex()
  const rr = ri >= 0 ? rooms[ri] : null
  $('roomPos').textContent = `画面 (${cam.cx}, ${cam.cy})` + (ri >= 0 ? `　部屋の番号 ${ri}` : '') + (rr?.light ? `　光の部屋 ${REALMS[REALM]?.no ?? '?'}-${rr.no ?? '?'}` : '')
  $('roomNone').style.display = ri < 0 ? '' : 'none'
  $('roomEdit').style.display = ri < 0 ? 'none' : ''
  if (ri < 0) return
  const r = rooms[ri]
  if (document.activeElement !== $('roomName')) $('roomName').value = r.name
  if (document.activeElement !== $('roomNote')) $('roomNote').value = r.note || ''
  if (document.activeElement !== $('roomPlace')) $('roomPlace').value = r.place || ''
  showRoomSigns(r)
  showRoomDonors(r)
  $('roomLight').checked = !!r.light
  $('roomNoBox').style.display = r.light ? '' : 'none'
  $('roomNoRealm').textContent = REALMS[REALM]?.no ?? '?'
  if (document.activeElement !== $('roomNo')) $('roomNo').value = r.no ?? ''
  $('roomW').value = r.rows[0].length / SW
  $('roomH').value = r.rows.length / SH
  showJoin(ri)
}
// となりの部屋とつなげる（2026-11-06）: 上下左右でぴったり接して、合わせると長方形になる部屋ごとにボタン
const SIDE = { left: '左', right: '右', up: '上', down: '下' }
function joinables(ri) {
  const r = rooms[ri], w = r.rows[0].length, h = r.rows.length, out = []
  rooms.forEach((o, oi) => {
    if (oi === ri) return
    const ow = o.rows[0].length, oh = o.rows.length
    if (o.y === r.y && oh === h && o.x === r.x + w) out.push({ oi, side: 'right' })
    if (o.y === r.y && oh === h && o.x + ow === r.x) out.push({ oi, side: 'left' })
    if (o.x === r.x && ow === w && o.y === r.y + h) out.push({ oi, side: 'down' })
    if (o.x === r.x && ow === w && o.y + oh === r.y) out.push({ oi, side: 'up' })
  })
  return out
}
function showJoin(ri) {
  const box = $('roomJoin')
  box.innerHTML = ''
  for (const j of joinables(ri)) {
    const b = Object.assign(document.createElement('button'), { className: 'act', textContent: `${SIDE[j.side]}の ${j.oi}「${rooms[j.oi].name}」とつなげる` })
    b.onclick = () => joinRooms(ri, j.oi)
    box.append(b)
  }
  box.style.display = box.children.length ? '' : 'none'
}
// 二つの部屋を一つに: 今の部屋（ri）に、となりの部屋（oi）のタイルと看板の文を入れる。名前・メモ・光の部屋などは今の部屋のもの。oi は消える
function joinRooms(ri, oi) {
  const r = rooms[ri], o = rooms[oi]
  const lost = [o.light && !r.light && '光の部屋の印', o.note && 'メモ', o.place && '経典の場所', o.seat && '座る所', o.buddha && 'buddha', o.sariputta && 'sariputta', o.loop && 'loop', o.end && 'end'].filter(Boolean)
  const msg = `${oi}「${o.name}」を、この部屋 ${ri}「${r.name}」につなげて一つの部屋にします。` +
    `\n名前・メモ・光の部屋などは「${r.name}」のものを残します。` + (lost.length ? `\n「${o.name}」の ${lost.join('・')} は消えます。` : '') +
    `\n${oi} より後ろの部屋の番号が一つずつ詰まります。よいですか？`
  if (!confirm(msg)) return
  commit()
  const x0 = Math.min(r.x, o.x), y0 = Math.min(r.y, o.y)
  const w = Math.max(r.x + r.rows[0].length, o.x + o.rows[0].length) - x0, h = Math.max(r.y + r.rows.length, o.y + o.rows.length) - y0
  const at = (rm, tx, ty) => rm.rows[ty - rm.y]?.[tx - rm.x]
  const rows = Array.from({ length: h }, (_, j) => Array.from({ length: w }, (_, i) => at(r, x0 + i, y0 + j) ?? at(o, x0 + i, y0 + j) ?? '#').join(''))
  const signs = {}
  for (const rm of [r, o]) for (const [k, id] of Object.entries(rm.signs || {})) { const [x, y] = k.split(',').map(Number); signs[`${x + rm.x - x0},${y + rm.y - y0}`] = id }
  const donors = {}
  for (const rm of [r, o]) for (const [k, l] of Object.entries(rm.donors || {})) { const [x, y] = k.split(',').map(Number); donors[`${x + rm.x - x0},${y + rm.y - y0}`] = l }
  const gifts = {}
  for (const rm of [r, o]) for (const [k, l] of Object.entries(rm.gifts || {})) { const [x, y] = k.split(',').map(Number); gifts[`${x + rm.x - x0},${y + rm.y - y0}`] = l }
  if (r.seat) r.seat = [r.seat[0] + r.x - x0, r.seat[1] + r.y - y0]
  if (r.loopStart) r.loopStart += r.x - x0
  r.x = x0; r.y = y0; r.rows = rows
  if (Object.keys(signs).length) r.signs = signs; else delete r.signs
  if (Object.keys(donors).length) r.donors = donors; else delete r.donors
  if (Object.keys(gifts).length) r.gifts = gifts; else delete r.gifts
  if (o.light && !r.light) { r.light = true; r.no = o.no }
  rooms.splice(oi, 1)
  rebuild()
  toast(`つなげました: ${roomRef(rooms.indexOf(r))}`)
}
const editRoom = (fn) => { const ri = curRoomIndex(); if (ri < 0) return; commit(); fn(rooms[ri]); rebuild() }
$('roomName').addEventListener('change', (e) => editRoom((r) => (r.name = e.target.value.trim())))   // 空にすると、ゲームの右上に部屋の名前を出さない（2026-11-07。前は「名無しの部屋」になった）
$('roomPlace').addEventListener('change', (e) => editRoom((r) => { if (e.target.value) r.place = e.target.value; else delete r.place }))
// 看板（2026-11-05 から看板ごとに番号。部屋の signs: { "x,y": 番号 }）: 部屋の中の B を並べ、それぞれの文を選ぶ。まだどこにも置いていない文を上に
const usedSigns = () => { const m = new Map(); rooms.forEach((r, ri) => Object.entries(r.signs || {}).forEach(([k, id]) => { const [x, y] = k.split(',').map(Number); if (r.rows[y]?.[x] === 'B' || r.rows[y]?.[x] === 'b') m.set(id, [...(m.get(id) || []), `${ri}「${r.name}」(${x}, ${y})`]) })); return m }
const signTitle = (id) => `${id}　${signs[id]?.ja?.lines?.[0]?.slice(0, 14) ?? ''}…`
function showRoomSigns(r) {
  const box = $('roomSigns')
  if (box.contains(document.activeElement)) return
  box.innerHTML = ''
  const used = usedSigns(), ids = Object.keys(signs)
  r.rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c !== 'B' && c !== 'b') return
    const key = `${x},${y}`, cur = r.signs?.[key] || ''
    const div = document.createElement('div'); div.className = 'row'
    const sel = document.createElement('select')
    const opt = (v, label) => { const o = document.createElement('option'); o.value = v; o.textContent = label; sel.append(o) }
    opt('', '（文を選ぶ）')
    for (const id of [...ids.filter((i) => !used.has(i) || i === cur), ...ids.filter((i) => used.has(i) && i !== cur)]) opt(id, (used.has(id) && id !== cur ? '（置いてある）' : '') + signTitle(id))
    sel.value = cur
    sel.addEventListener('change', () => editRoom((rr) => { if (sel.value) (rr.signs ||= {})[key] = sel.value; else if (rr.signs) { delete rr.signs[key]; if (!Object.keys(rr.signs).length) delete rr.signs } }))
    div.append(Object.assign(document.createElement('span'), { textContent: `${c === 'b' ? '岩の中の看板' : '看板'} (${x}, ${y})` }), sel)
    box.append(div)
  }))
}
$('roomNote').addEventListener('change', (e) => editRoom((r) => { if (e.target.value) r.note = e.target.value; else delete r.note }))
// 光の部屋の番号（2026-11-08）: 光の部屋にすると、空いているいちばん小さい番号を付ける。外すと番号も消す。番号は欄で変えられる（同じ番号は保存できない）
const freeLightNo = () => { const used = new Set(rooms.filter((q) => q.light).map((q) => q.no)); let n = 1; while (used.has(n)) n++; return n }
$('roomLight').addEventListener('change', (e) => editRoom((r) => { if (e.target.checked) { r.light = true; if (r.no == null) r.no = freeLightNo() } else { delete r.light; delete r.no } }))
$('roomNo').addEventListener('change', (e) => editRoom((r) => { const n = parseInt(e.target.value, 10); if (n > 0) r.no = n }))
// 光の部屋に結ぶもの（2026-11-08）: 布施人（Y・Q。部屋の donors）と施す食べ物（G。部屋の gifts）。{ "x,y": "3-5" } の形
const LINK_OF = { Y: 'donors', Q: 'donors', G: 'gifts' }
const LINK_NAME = { Y: '布施人', Q: 'サーリプッタ', G: '施す食べ物' }
// 部屋の中の布施人・施す食べ物を並べ、それぞれ結ぶ光の部屋を選ぶ
const lightRooms = () => rooms.map((q, i) => ({ q, i })).filter(({ q }) => q.light && q.no != null).sort((a, b) => a.q.no - b.q.no)
function showRoomDonors(r) {
  const box = $('roomDonors')
  if (box.contains(document.activeElement)) return
  box.innerHTML = ''
  const rn = REALMS[REALM]?.no
  r.rows.forEach((row, y) => [...row].forEach((c, x) => {
    const field = LINK_OF[c]
    if (!field) return
    const key = `${x},${y}`, cur = r[field]?.[key] || ''
    const div = document.createElement('div'); div.className = 'row'
    const sel = document.createElement('select')
    const opt = (v, label) => { const o = document.createElement('option'); o.value = v; o.textContent = label; sel.append(o) }
    opt('', '（光の部屋を選ぶ）')
    for (const { q, i } of lightRooms()) opt(`${rn}-${q.no}`, `${rn}-${q.no}　部屋 ${i}「${q.name}」${c !== 'G' && !q.donor ? '（布施人の部屋ではない）' : ''}`)
    sel.value = cur
    sel.addEventListener('change', () => editRoom((rr) => { if (sel.value) (rr[field] ||= {})[key] = sel.value; else if (rr[field]) { delete rr[field][key]; if (!Object.keys(rr[field]).length) delete rr[field] } }))
    div.append(Object.assign(document.createElement('span'), { textContent: `${LINK_NAME[c]} (${x}, ${y})` }), sel)
    box.append(div)
  }))
}
$('roomSize').addEventListener('click', () => {
  const ri = curRoomIndex()
  if (ri < 0) return
  const r = rooms[ri], w = Math.max(1, Number($('roomW').value) | 0) * SW, h = Math.max(1, Number($('roomH').value) | 0) * SH
  // 広げて重なるときは、元の右端より右の部屋を全部右へ、元の下端より下の部屋を全部下へ、広げた分だけずらす（2026-11-05。
  //   重なった部屋だけを動かすと、その先の部屋とのつながりがずれるので、まとめて）。元の端をまたいでいる部屋があると、ずらせない
  const ow = r.rows[0].length, oh = r.rows.length, dw = Math.max(0, w - ow), dh = Math.max(0, h - oh)
  const overlaps = (list) => list.find((o) => o !== r && o.x < r.x + w && o.x + o.rows[0].length > r.x && o.y < r.y + h && o.y + o.rows.length > r.y)
  let moves = null
  if (overlaps(rooms)) {
    const right = rooms.filter((o) => o !== r && o.x >= r.x + ow), below = rooms.filter((o) => o !== r && o.y >= r.y + oh)
    const straddle = rooms.find((o) => o !== r && ((dw && o.x < r.x + ow && o.x + o.rows[0].length > r.x + ow) || (dh && o.y < r.y + oh && o.y + o.rows.length > r.y + oh)))
    // ずらしたあとの位置で、まだ重なるか確かめる
    const moved = rooms.map((o, oi) => oi === ri ? { ...o, w, h } : { ...o, x: o.x + (right.includes(o) ? dw : 0), y: o.y + (below.includes(o) ? dh : 0), w: o.rows[0].length, h: o.rows.length })
    const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
    const clash = moved.flatMap((a, i) => moved.filter((b, j) => j > i && hit(a, b)).map((b) => (i === ri ? b : a)))[0]
    if (straddle || clash) { alert(`「${(straddle || clash).name}」と重なるので、この大きさにはできません（ずらしても重なる）`); return }
    const nr = dw ? right.length : 0, nb = dh ? below.length : 0
    const msg = [dw && nr ? `右の部屋を ${nr} 個、${dw / SW} 画面ぶん右へ` : '', dh && nb ? `下の部屋を ${nb} 個、${dh / SH} 画面ぶん下へ` : ''].filter(Boolean).join('、')
    if (!confirm(`重なるので、${msg}ずらします。よいですか？`)) return
    moves = { right: dw ? right : [], below: dh ? below : [] }
  }
  commit()
  if (moves) { for (const o of moves.right) o.x += dw; for (const o of moves.below) o.y += dh }
  r.rows = Array.from({ length: h }, (_, j) => Array.from({ length: w }, (_, i) => r.rows[j]?.[i] ?? '#').join(''))
  rebuild()
})
$('roomDel').addEventListener('click', () => {
  const ri = curRoomIndex()
  if (ri < 0 || !confirm(`「${rooms[ri].name}」を消しますか？（後ろの部屋の番号が一つずつ詰まります）`)) return
  commit(); rooms.splice(ri, 1); rebuild()
})
$('play').onclick = () => startPlay(false)
$('save').onclick = save
$('undo').onclick = undo
$('redo').onclick = redo
$('discard').onclick = discard

// タイルの見本（本物の描画で一つずつ描いて切り出す）
function makeTools() {
  // 見本は一画面（20 × 15）の中に、一つおきに 9 個ずつ並べて描く（画面の外に置くと描かれない。2026-11-05 まで一列に並べていて、10 個目から先が壊れていた）
  const PER = 9, at = (k) => [1 + (k % PER) * 2, 1 + Math.floor(k / PER) * 2]
  const grid = Array.from({ length: SH }, () => Array(SW).fill('.'))
  toolsHere().forEach((t, k) => { const [x, y] = at(k); grid[y][x] = t.ch })
  const rows = grid.map((r) => r.join(''))
  const w = buildWorld([{ name: '見本', x: 0, y: 0, rows }], { strict: false, realm: REALM })
  renderer.draw({ world: w, cam: { x: 0, y: 0 }, room: null, player: null, dead: null, flowers: [], petals: [], time: 0.3 }, 0.3, { hud: false })
  // 選ぶ（矢印）: タイルを置かず、マスを選ぶ。押すと 1 マス、なぞると範囲。離すとその場所を写す（2026-11-05）
  {
    const b = document.createElement('button'), c = document.createElement('canvas'); c.width = 16; c.height = 16
    const cx = c.getContext('2d')
    const ARROW = ['X...........', 'XX..........', 'XwX.........', 'XwwX........', 'XwwwX.......', 'XwwwwX......', 'XwwwwwX.....', 'XwwwwwwX....', 'XwwwwXXXX...', 'XwwXwX......', 'XwX.XwX.....', 'XX..XwX.....', 'X....XwX....', '.....XX.....']
    ARROW.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') { cx.fillStyle = ch === 'X' ? '#0d0b14' : '#ffffff'; cx.fillRect(i + 3, j + 1, 1, 1) } }))
    b.append(c, Object.assign(document.createElement('span'), { textContent: '選ぶ' }), Object.assign(document.createElement('kbd'), { textContent: 'v' }))
    b.onclick = () => selectTool(SELECT)
    b.dataset.ch = SELECT
    $('tools').append(b)
  }
  toolsHere().forEach((t, k) => {
    const b = document.createElement('button')
    const c = document.createElement('canvas'); c.width = 16; c.height = 16
    const cx = c.getContext('2d'), id = cx.createImageData(16, 16), d32 = new Uint32Array(id.data.buffer)
    const x0 = at(k)[0] * TILE, y0 = at(k)[1] * TILE
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) d32[j * 16 + i] = PAL32[fb[(y0 + j) * W + x0 + i]]
    cx.putImageData(id, 0, 0)
    if (MARK[t.ch]) { cx.font = 'bold 11px sans-serif'; cx.textAlign = 'center'; cx.fillStyle = `rgb(${MARK[t.ch]})`; cx.fillText(t.ch, 8, 12) }
    b.append(c)
    b.append(Object.assign(document.createElement('span'), { textContent: toolName(t) }))
    b.append(Object.assign(document.createElement('kbd'), { textContent: t.key }))
    b.onclick = () => selectTool(t.ch)
    b.dataset.ch = t.ch
    $('tools').append(b)
  })
}
function selectTool(ch) { tool = ch; for (const b of $('tools').children) b.classList.toggle('on', b.dataset.ch === ch); if (mode === 'edit') over.style.cursor = ch === SELECT ? 'default' : 'crosshair' }

// 地図全体（1 タイル 2 ドットで描き、浮かぶ窓の大きさに合わせて広げる。2026-11-05 に右の欄から浮かぶ窓へ移した）
const mini = $('mini'), mctx = mini.getContext('2d')
// 浮かぶ窓（画面・地図全体）: 題の帯をつかんで動かす。右下の角（CSS の resize）で大きさを変える。位置と大きさはブラウザに覚える
let floatTop = 10   // 浮かぶ窓の重なり（いちばん上の番号）
function floatWin(win, bar, key, def, onResize) {
  let st = null
  try { st = JSON.parse(localStorage.getItem(key)) } catch {}
  if (!st || !(st.w > 40) || !(st.h > 40)) st = def()   // 大きさ 0 を覚えてしまった前の記録は捨てる
  // 隠れている窓（看板の窓）は大きさが 0 に測られるので、位置を直したり覚えたりしない（2026-11-07。左上に戻り、大きさ 0 を覚えていた）
  const hidden = () => win.style.display === 'none' || !win.getBoundingClientRect().width
  const clampPos = () => {
    if (hidden()) return
    const r = win.getBoundingClientRect()
    win.style.left = `${Math.max(0, Math.min(innerWidth - 60, r.left))}px`
    win.style.top = `${Math.max(0, Math.min(innerHeight - 24, r.top))}px`
  }
  Object.assign(win.style, { left: `${st.x}px`, top: `${st.y}px`, width: `${st.w}px`, height: `${st.h}px` })
  clampPos()
  const remember = () => { if (hidden()) return; const r = win.getBoundingClientRect(); try { localStorage.setItem(key, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })) } catch {} }
  // 窓のどこかを押したら前に出す（押した順に重なりを上げる）
  win.addEventListener('pointerdown', () => { win.style.zIndex = String(++floatTop) }, true)
  let drag = null
  bar.addEventListener('pointerdown', (e) => { const r = win.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; bar.setPointerCapture(e.pointerId) })
  bar.addEventListener('pointermove', (e) => { if (!drag) return; win.style.left = `${e.clientX - drag.dx}px`; win.style.top = `${e.clientY - drag.dy}px`; clampPos() })
  bar.addEventListener('pointerup', () => { drag = null; remember() })
  new ResizeObserver(() => { if (hidden()) return; clampPos(); onResize(); remember() }).observe(win)   // 隠れていた窓を開いたときも、ここで画面の中に収める
  addEventListener('resize', clampPos)
}
floatWin($('miniWin'), $('miniBar'), 'reincarnation-editor-mini', () => ({ x: 12, y: innerHeight - 232, w: 640, h: 220 }), () => fitMini())
// 窓の中に、縦横の比を保って収める
function fitMini() {
  const box = $('miniBox'), bw = box.clientWidth - 8, bh = box.clientHeight - 8
  if (!mini.width || bw <= 0 || bh <= 0) return
  const k = Math.min(bw / mini.width, bh / mini.height)
  mini.style.width = `${Math.floor(mini.width * k)}px`; mini.style.height = `${Math.floor(mini.height * k)}px`
}
let miniBase = null
const MS = 2
const MINI_COL = { [K.air]: P.gy1, [K.rock]: P.gy3, [K.fire]: P.or2, [K.spikeUp]: P.white, [K.spikeDown]: P.white, [K.spikeRight]: P.white, [K.spikeLeft]: P.white, [K.jet]: P.ye2, [K.hidden]: P.pk2, [K.door]: P.tl3, [K.fakeFire]: P.or2, [K.crumble]: P.br4 }
function drawMiniBase() {
  const w = world.w + SW, h = world.h + SH   // 右と下に一画面ぶんの余白（部屋を足せるように）
  const resized = mini.width !== w * MS || mini.height !== h * MS
  mini.width = w * MS; mini.height = h * MS
  if (resized) fitMini()
  miniBase = mctx.createImageData(mini.width, mini.height)
  const d32 = new Uint32Array(miniBase.data.buffer)
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const inside = tx < world.w && ty < world.h
    const i = ty * world.w + tx, ri = inside ? world.roomOf[i] : -1
    let c = ri < 0 ? P.black : MINI_COL[world.t[i]]
    if (ri >= 0 && world.rooms[ri].light && world.t[i] === K.air) c = P.bl4
    for (let y = 0; y < MS; y++) for (let x = 0; x < MS; x++) d32[(ty * MS + y) * mini.width + tx * MS + x] = PAL32[c]
  }
}
function drawMini() {
  if (!miniBase) return
  mctx.putImageData(miniBase, 0, 0)
  mctx.strokeStyle = '#ffe066'; mctx.lineWidth = 1
  const c = mode === 'play' ? { x: game.cam.x / TILE, y: game.cam.y / TILE } : { x: cam.cx * SW, y: cam.cy * SH }
  mctx.strokeRect(c.x * MS + 0.5, c.y * MS + 0.5, SW * MS - 1, SH * MS - 1)
  if (mode === 'play' && game.player) { mctx.fillStyle = '#5fb3ff'; mctx.fillRect(Math.floor(game.player.x / TILE) * MS - 1, Math.floor(game.player.y / TILE) * MS - 3, 3, 4) }
}
mini.addEventListener('mousedown', (e) => {
  if (mode !== 'edit') return
  const b = mini.getBoundingClientRect()
  const tx = ((e.clientX - b.left) / b.width) * mini.width / MS, ty = ((e.clientY - b.top) / b.height) * mini.height / MS
  cam.cx = Math.floor(tx / SW); cam.cy = Math.floor(ty / SH)
  showRoom()
})

// ---- マウス ----
const mouse = { in: false, tx: 0, ty: 0 }
let stroke = null   // { erase, last: [tx, ty] }
let move = null     // 選んだ範囲をつかんで動かしている間 { g: 範囲, from: [tx, ty] 押したマス, px, py: 押したドット, dx, dy: ずらすマス, active: 少し動いたら true }
let sel = null      // 選んだ範囲 { a: [tx, ty], b: [tx, ty], drag: なぞっている間 }（「選ぶ」の道具。離すと写す。次に押すまで枠が残る）
const camPx = () => ({ x: cam.cx * SW * TILE, y: cam.cy * SH * TILE })
function tileOfEvent(e) {
  const c = camPx()
  return [Math.floor((e.offsetX / scale + c.x) / TILE), Math.floor((e.offsetY / scale + c.y) / TILE)]
}
over.addEventListener('contextmenu', (e) => e.preventDefault())
over.addEventListener('mousedown', (e) => {
  if (mode !== 'edit') return
  e.preventDefault()
  const [tx, ty] = tileOfEvent(e)
  // 選んだ範囲の中を押したら、つかむ（動かせば移動。動かさずに離せば、今までの「選ぶ」と同じ）
  if (tool === SELECT && e.button === 0 && sel && !sel.drag && inSel(tx, ty)) {
    move = { g: selRange(), from: [tx, ty], px: e.offsetX, py: e.offsetY, dx: 0, dy: 0, active: false, cx: e.clientX, cy: e.clientY, edgeAt: 0 }
    return
  }
  sel = null
  // Ctrl・Shift・Alt との組み合わせは使わない（2026-11-05 にやめた。選ぶのは「選ぶ」の道具で）
  if (e.button === 1) { const ch = charAt(tx, ty); if (ch) selectTool(ch); return }   // 中クリック: そのタイルを拾う（どの道具でも。「選ぶ」のときも）
  if (tool === SELECT && e.button === 0) { sel = { a: [tx, ty], b: [tx, ty], drag: true }; return }   // 選んで、離すと写す（右は、どの道具でも消す）
  const erase = e.button === 2
  commit()
  stroke = { erase, last: [tx, ty], changed: false }
  stroke.changed = setTile(tx, ty, erase ? '.' : tool, { create: !erase })
  if (stroke.changed) rebuild(); else history.pop()   // 何も変わらなければ、戻す記録も残さない
  if (!stroke.changed) stroke.pending = true
})
over.addEventListener('mousemove', (e) => {
  const [tx, ty] = tileOfEvent(e)
  mouse.in = true; mouse.tx = tx; mouse.ty = ty
  if (move) {
    if (!move.active && Math.hypot(e.offsetX - move.px, e.offsetY - move.py) > 4) move.active = true
    if (move.active) { move.dx = tx - move.from[0]; move.dy = ty - move.from[1] }
    return
  }
  if (tool === SELECT && mode === 'edit') over.style.cursor = sel && !sel.drag && inSel(tx, ty) ? 'move' : 'default'
  if (sel?.drag) { sel.b = [tx, ty]; return }
  if (!stroke) return
  // 前の所から線で（速く動かしても抜けないように）
  let [x0, y0] = stroke.last
  const dx = Math.abs(tx - x0), dy = -Math.abs(ty - y0), sx = x0 < tx ? 1 : -1, sy = y0 < ty ? 1 : -1
  let err = dx + dy, changed = false
  if (stroke.pending) { commit(); stroke.pending = false; stroke.undoPending = true }
  for (;;) {
    changed = setTile(x0, y0, stroke.erase ? '.' : tool, { create: !stroke.erase }) || changed
    if (x0 === tx && y0 === ty) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
  }
  stroke.last = [tx, ty]
  if (changed) { stroke.changed = true; rebuild() }
})
over.addEventListener('mouseleave', () => { mouse.in = false })
// 画面をまたいで動かす（2026-11-07）: 動かしている間は、画面の外へ出ても指の位置を追う。画面の端（内側 8 ドット）か外に 0.45 秒とどまると、
//   その向きのとなりの画面へ移る（とどまり続ければ、0.6 秒ごとにさらに先へ）。移った分だけ、運ぶ先もずれる
function moveAt(clientX, clientY) {
  const b = over.getBoundingClientRect(), c = camPx()
  const tx = Math.floor(((clientX - b.left) / scale + c.x) / TILE), ty = Math.floor(((clientY - b.top) / scale + c.y) / TILE)
  move.dx = tx - move.from[0]; move.dy = ty - move.from[1]
}
addEventListener('mousemove', (e) => {
  if (!move) return
  move.cx = e.clientX; move.cy = e.clientY
  if (!move.active && Math.hypot(e.clientX - over.getBoundingClientRect().left - move.px, e.clientY - over.getBoundingClientRect().top - move.py) > 4) move.active = true
  if (move.active) moveAt(e.clientX, e.clientY)
})
function edgeScroll(now) {
  if (!move?.active) return
  const b = over.getBoundingClientRect(), m = 8
  const dx = move.cx < b.left + m ? -1 : move.cx > b.right - m ? 1 : 0, dy = move.cy < b.top + m ? -1 : move.cy > b.bottom - m ? 1 : 0
  if (!dx && !dy) { move.edgeAt = 0; return }
  if (!move.edgeAt) { move.edgeAt = now + 450; return }
  if (now < move.edgeAt) return
  moveCam(dx, dy); move.edgeAt = now + 600
  moveAt(move.cx, move.cy)
}
addEventListener('mouseup', () => {
  if (move) {
    const m = move; move = null
    if (!m.active) { copySel(); pickSign(); return }
    if (!m.dx && !m.dy) return
    const bad = moveBad(m.g, m.dx, m.dy)
    if (bad.length) { toast(bad.some((b) => b.why === 'sign') ? '動かす先に看板があるので、動かせません' : '動かす先が部屋の外なので、動かせません'); return }
    moveTiles(m.g, m.dx, m.dy)
    sel = { a: [m.g.x0 + m.dx, m.g.y0 + m.dy], b: [m.g.x1 + m.dx, m.g.y1 + m.dy], drag: false }
    copySel()
    return
  }
  if (sel?.drag) { sel.drag = false; copySel(); pickSign() }   // 看板を押したら、看板の窓
  if (stroke) { if (stroke.undoPending && !stroke.changed) history.pop(); stroke = null; showStatus() }
})

// ---- 遊ぶ ----
const input = createInput()
let mode = 'edit', game = null
// 看板の窓で原典のページを開く（ゲームの main.js の decideSign と同じ。キーやクリックのその瞬間に開く）
if (import.meta.env.DEV) window.editorGame = () => game   // 確かめ用
function openSignSource() {
  if (!game?.canDecide?.()) return
  openSignPage(game.reading.id, LANG)
}
over.addEventListener('click', (e) => { if (mode !== 'play' || !game?.reading) return; if (renderer.onSignLink(e.offsetX / scale, e.offsetY / scale)) openSignSource(); else game.closeReading() })   // 「原典を開く」の上なら原典、ほかは閉じる
function startPlay() {
  const w = buildWorld(rooms, { strict: false, realm: REALM })
  let spawn = null
  // マウスの所から（部屋の中の、体が入る所なら）
  if (mouse.in) {
    const ch = charAt(mouse.tx, mouse.ty), up = charAt(mouse.tx, mouse.ty - 1)
    if (ch && '.S'.includes(ch) && up && '.S'.includes(up)) spawn = { x: mouse.tx * TILE + TILE / 2, y: (mouse.ty + 1) * TILE }
  }
  // マウスが画面の外（遊ぶボタンを押したときなど）: 今見ている画面の中の、立てる所から（画面の真ん中にいちばん近い所。2026-11-05 まではじまりからだった）
  if (!spawn) {
    const x0 = cam.cx * SW, y0 = cam.cy * SH
    let best = null
    for (let ty = y0; ty < y0 + SH; ty++) for (let tx = x0; tx < x0 + SW; tx++) {
      if (tileAt(w, tx, ty) !== K.air || tileAt(w, tx, ty - 1) !== K.air || !isSolidKind(tileAt(w, tx, ty + 1)) || roomIndexAt(tx, ty) < 0) continue
      const d = (tx - x0 - SW / 2) ** 2 + (ty - y0 - SH / 2) ** 2
      if (!best || d < best.d) best = { tx, ty, d }
    }
    if (best) spawn = { x: best.tx * TILE + TILE / 2, y: (best.ty + 1) * TILE }
  }
  if (!spawn && !w.start) { alert('はじまり（S）が無いので、マウスを部屋の空いた所に置いて Enter を押してください'); return }
  game = createGame({ world: w, realm: REALM, storage: null, spawn, fixedSpawn: true })
  mode = 'play'
  edge.style.visibility = 'hidden'   // 遊んでいる間は、まわりを出さない（画面は体について動く）
  placeArrows()
  input.clear()
  $('mode').textContent = '遊んでいます　何度死んでも同じ所から　Esc で戻る　R その場で死ぬ'
  $('mode').className = 'play'
  over.style.cursor = 'default'
}
function stopPlay() {
  edge.style.visibility = ''
  const p = game.player
  cam.cx = Math.floor(p.x / (SW * TILE)); cam.cy = Math.floor((p.y - 8) / (SH * TILE))
  mode = 'edit'; placeArrows()
  game = null
  $('mode').textContent = ''
  $('mode').className = ''
  over.style.cursor = tool === SELECT ? 'default' : 'crosshair'
  showRoom()
}

// ---- キー ----
addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); return }
  const k = e.key
  // 遊んでいる間（2026-11-05 に Enter で戻るのをやめた。看板の窓の Enter〈原典を開く〉とぶつかっていた）:
  //   看板を読んでいる間は、Enter で原典を開き、Esc で窓を閉じる（ゲームと同じ）。読んでいないときは Esc で描くのに戻る
  if (mode === 'play') {
    if (game.reading) {
      if ((k === 'x' || k === 'X') && !e.repeat) { e.preventDefault(); openSignSource() }
      if (k === 'Enter') { e.preventDefault(); game.closeReading() }
      if (k === 'Escape') { e.preventDefault(); game.closeReading() }
      return
    }
    if (k === 'Escape') { e.preventDefault(); stopPlay() }
    return
  }
  if (e.ctrlKey || e.metaKey) {
    const kl = k.toLowerCase()
    if (kl === 's') { e.preventDefault(); save() }
    else if (kl === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
    else if (kl === 'y' || (kl === 'z' && e.shiftKey)) { e.preventDefault(); redo() }
    return
  }
  if (k === 'Escape') { if (move) move = null; else sel = null; return }   // 選んだ範囲を消す
  if (k === 'Enter') { e.preventDefault(); startPlay(); return }
  const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] }[k.length === 1 ? k.toLowerCase() : k]
  if (move) { e.preventDefault(); moveCam(...move); return }
  if (k === 'v') { selectTool(SELECT); return }
  const t = toolsHere().find((t) => t.key === k)
  if (t) { selectTool(t.ch); return }
  if (k.toLowerCase() === 'g') grid = !grid
})

// ---- 描く ----
function drawOverlay(t) {
  const s = scale, c = camPx()
  octx.clearRect(0, 0, over.width, over.height)
  if (mode !== 'edit') return
  const tx0 = c.x / TILE, ty0 = c.y / TILE
  const roomAtTile = (tx, ty) => roomIndexAt(tx, ty)
  octx.font = `bold ${Math.max(9, 11 * s)}px sans-serif`   // 印の字は、まわりの帯（11 ドット）と同じ大きさ（2026-11-07。前は 5 ドットぶんで小さかった）
  octx.textAlign = 'center'; octx.textBaseline = 'middle'
  for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) {
    const tx = tx0 + i, ty = ty0 + j, x = i * TILE * s, y = j * TILE * s, z = TILE * s
    const ri = roomAtTile(tx, ty)
    if (ri < 0) {
      // 部屋の外: 暗く斜線
      octx.fillStyle = 'rgba(13,11,20,0.82)'; octx.fillRect(x, y, z, z)
      octx.strokeStyle = 'rgba(70,68,95,0.6)'; octx.lineWidth = 1
      octx.beginPath(); octx.moveTo(x, y + z); octx.lineTo(x + z, y); octx.stroke()
      continue
    }
    const ch = charAt(tx, ty)
    if (MARK[ch] && !(TERRAIN.has(ch) && loopCopyAt(tx, ty))) {   // 写しの場所の地形の印は描かない（地図の字は古いことがある。地形は自動でそろう）
      const col = MARK[ch]
      if (ch === 'H' || ch === 'D' || ch === 'b') { octx.fillStyle = `rgba(${col},0.28)`; octx.fillRect(x, y, z, z) }
      octx.strokeStyle = `rgb(${col})`; octx.lineWidth = Math.max(1, s / 2); octx.strokeRect(x + 1, y + 1, z - 2, z - 2)
      octx.fillStyle = `rgb(${col})`; octx.fillText(ch, x + z / 2, y + z / 2)
    }
    // 布施人: 上に結んだ光の部屋の番号（3-5 など。結んでいなければ「?」を赤く。2026-11-08）
    if (LINK_OF[ch]) {   // 布施人・施す食べ物
      const r = rooms[ri], link = r[LINK_OF[ch]]?.[`${tx - r.x},${ty - r.y}`]
      octx.save(); octx.font = `bold ${Math.max(10, 3.5 * s)}px sans-serif`; octx.textBaseline = 'bottom'
      const label = link || '?', lw = octx.measureText(label).width + 6
      octx.fillStyle = 'rgba(0,0,0,0.65)'; octx.fillRect(x + z / 2 - lw / 2, y - Math.max(10, 3.5 * s) - 4, lw, Math.max(10, 3.5 * s) + 4)
      octx.fillStyle = link ? '#9ff0b8' : '#ff6a6a'; octx.fillText(label, x + z / 2, y - 1)
      octx.restore()
    }
    // 看板: 上に文の番号（決まっていなければ「?」を赤く）
    if (ch === 'B' || ch === 'b') {
      const r = rooms[ri], id = r.signs?.[`${tx - r.x},${ty - r.y}`]
      octx.save(); octx.font = `${Math.max(10, 3.5 * s)}px sans-serif`; octx.textBaseline = 'bottom'
      const label = id || '?', lw = octx.measureText(label).width + 6
      octx.fillStyle = 'rgba(0,0,0,0.65)'; octx.fillRect(x + z / 2 - lw / 2, y - Math.max(10, 3.5 * s) - 4, lw, Math.max(10, 3.5 * s) + 4)
      octx.fillStyle = id ? '#ffe066' : '#ff6a6a'; octx.fillText(label, x + z / 2, y - 1)
      octx.restore()
    }
    // 部屋のさかい
    octx.strokeStyle = '#ffe066'; octx.lineWidth = Math.max(2, s)
    if (roomAtTile(tx + 1, ty) !== ri) { octx.beginPath(); octx.moveTo(x + z, y); octx.lineTo(x + z, y + z); octx.stroke() }
    if (roomAtTile(tx, ty + 1) !== ri) { octx.beginPath(); octx.moveTo(x, y + z); octx.lineTo(x + z, y + z); octx.stroke() }
    if (roomAtTile(tx - 1, ty) !== ri) { octx.beginPath(); octx.moveTo(x, y); octx.lineTo(x, y + z); octx.stroke() }
    if (roomAtTile(tx, ty - 1) !== ri) { octx.beginPath(); octx.moveTo(x, y); octx.lineTo(x + z, y); octx.stroke() }
  }
  if (grid) {
    octx.strokeStyle = 'rgba(255,255,255,0.12)'; octx.lineWidth = 1
    octx.beginPath()
    for (let i = 1; i < SW; i++) { octx.moveTo(i * TILE * s + 0.5, 0); octx.lineTo(i * TILE * s + 0.5, over.height) }
    for (let j = 1; j < SH; j++) { octx.moveTo(0, j * TILE * s + 0.5); octx.lineTo(over.width, j * TILE * s + 0.5) }
    octx.stroke()
  }
  // 部屋の名前
  const ri = curRoomIndex()
  octx.textAlign = 'left'; octx.textBaseline = 'top'; octx.font = `${Math.max(11, 4 * s)}px sans-serif`
  const label = ri >= 0 ? `${ri} ${rooms[ri].name}${rooms[ri].light ? '（光）' : ''}` : '部屋なし'
  octx.fillStyle = 'rgba(0,0,0,0.6)'; octx.fillRect(4, 4, octx.measureText(label).width + 12, Math.max(11, 4 * s) + 8)
  octx.fillStyle = '#dcdae6'; octx.fillText(label, 10, 8)
  // マウスの所の、部屋の中の座標（左上が (0, 0)）
  const mi = mouse.in ? roomIndexAt(mouse.tx, mouse.ty) : -1
  if (mi >= 0) {
    const pos = `${mi !== ri ? `部屋 ${mi} ` : ''}(${mouse.tx - rooms[mi].x}, ${mouse.ty - rooms[mi].y})`
    const pw = octx.measureText(pos).width + 12
    octx.fillStyle = 'rgba(0,0,0,0.6)'; octx.fillRect(over.width - pw - 4, 4, pw, Math.max(11, 4 * s) + 8)
    octx.fillStyle = '#dcdae6'; octx.fillText(pos, over.width - pw + 2, 8)
  }
  // マウスの所・四角
  const box = (ax, ay, bx, by, col) => {
    const x = (Math.min(ax, bx) - tx0) * TILE * s, y = (Math.min(ay, by) - ty0) * TILE * s
    octx.strokeStyle = col; octx.lineWidth = Math.max(1, s / 2)
    octx.strokeRect(x + 0.5, y + 0.5, (Math.abs(bx - ax) + 1) * TILE * s - 1, (Math.abs(by - ay) + 1) * TILE * s - 1)
  }
  // 輪の道の写しの場所: 薄い斜線と、写ってくる誘うもの・看板（半透明。ゲームと同じ見え方に）
  for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) {
    const tx = tx0 + i, ty = ty0 + j
    if (!loopCopyAt(tx, ty)) continue
    const x = i * TILE * s, y = j * TILE * s, z = TILE * s
    octx.fillStyle = 'rgba(95,179,255,0.10)'; octx.fillRect(x, y, z, z)
    if ((tx + ty) % 4 === 0) { octx.strokeStyle = 'rgba(95,179,255,0.25)'; octx.beginPath(); octx.moveTo(x, y + z); octx.lineTo(x + z, y); octx.stroke() }
  }
  if (world.loop) {
    const lp = world.loop, Lt = lp.len / TILE, x0t = lp.x0 / TILE
    const ghost = (tx, ty, label, col) => {
      for (const o of [Lt, -Lt]) {
        const gx = tx + o
        if (!loopCopyAt(gx, ty) || gx < tx0 || gx >= tx0 + SW || ty < ty0 || ty >= ty0 + SH) continue
        const x = (gx - tx0) * TILE * s, y = (ty - ty0) * TILE * s, z = TILE * s
        octx.globalAlpha = 0.45
        octx.strokeStyle = `rgb(${col})`; octx.lineWidth = Math.max(1, s / 2); octx.strokeRect(x + 1, y + 1, z - 2, z - 2)
        octx.fillStyle = `rgb(${col})`; octx.font = `bold ${Math.max(9, 11 * s)}px sans-serif`; octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.fillText(label, x + z / 2, y + z / 2)
        octx.globalAlpha = 1
      }
    }
    for (const tm of world.tempts) if ((tm.tx >= x0t && tm.tx < x0t + LOOP_COPY) || (tm.tx >= x0t + Lt - LOOP_COPY && tm.tx < x0t + Lt)) ghost(tm.tx, tm.ty, 'T', MARK.T)
    for (const g of world.signs) if ((g.tx >= x0t && g.tx < x0t + LOOP_COPY) || (g.tx >= x0t + Lt - LOOP_COPY && g.tx < x0t + Lt)) ghost(g.tx, g.ty, 'B', '255,224,102')   // 一周の中の看板だけ（写しの場所や、継ぎ目より先のものは写さない）
  }
  if (move?.active) {
    // つかんで動かしている間: 元の所を暗く、動かす先にタイルの文字を半透明で。動かせない所は赤
    const g = move.g, z = TILE * s, bad = moveBad(g, move.dx, move.dy)
    const at = (tx, ty) => [(tx - tx0) * z, (ty - ty0) * z]
    octx.fillStyle = 'rgba(0,0,0,0.45)'
    for (let ty = g.y0; ty <= g.y1; ty++) for (let tx = g.x0; tx <= g.x1; tx++) { const [x, y] = at(tx, ty); octx.fillRect(x, y, z, z) }
    octx.font = `bold ${Math.max(9, 11 * s)}px sans-serif`; octx.textAlign = 'center'; octx.textBaseline = 'middle'
    for (let ty = g.y0; ty <= g.y1; ty++) for (let tx = g.x0; tx <= g.x1; tx++) {
      const ch = charAt(tx, ty)
      if (ch == null || ch === '.') continue
      const [x, y] = at(tx + move.dx, ty + move.dy)
      octx.fillStyle = ch === '#' ? 'rgba(150,146,170,0.55)' : 'rgba(255,224,102,0.3)'; octx.fillRect(x, y, z, z)
      if (ch !== '#') { octx.fillStyle = '#fff'; octx.fillText(ch, x + z / 2, y + z / 2) }
      if (ch === 'B' || ch === 'b') { const r = rooms[roomIndexAt(tx, ty)], id = r.signs?.[`${tx - r.x},${ty - r.y}`]; if (id) { octx.fillStyle = '#ffe066'; octx.fillText(id, x + z / 2, y - Math.max(6, 2 * s)) } }   // 看板は文の番号も一緒に
    }
    for (const b of bad) { const [x, y] = at(b.tx, b.ty); octx.fillStyle = 'rgba(255,70,70,0.45)'; octx.fillRect(x, y, z, z) }
    box(g.x0 + move.dx, g.y0 + move.dy, g.x1 + move.dx, g.y1 + move.dy, bad.length ? '#ff4646' : '#ffffff')
  } else if (sel) box(...sel.a, ...sel.b, Math.floor(t * 3) % 2 ? '#ffe066' : '#5fb3ff')
  if (!sel && mouse.in) box(mouse.tx, mouse.ty, mouse.tx, mouse.ty, Math.floor(t * 3) % 2 ? '#ffffff' : '#ffe066')
}

const STEP = 1 / 60
let acc = 0, last = performance.now(), t = 0
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000)
  last = now
  while (acc >= STEP) {
    if (mode === 'play') {
      const inp = input.read()
      if (inp.reset && !game.dead) game.die('self')
      game.step(inp, T, STEP)
    }
    t += STEP
    acc -= STEP
  }
  edgeScroll(now)
  if (world) {
    if (mode === 'play') renderer.draw(game, t)
    else {
      const c = camPx()
      drawEdge(c, t)
      renderer.draw({ world, cam: c, room: roomAt(world, c.x + W / 2, c.y + H / 2), player: null, dead: null, flowers: [], petals: [], time: t }, t, { hud: false })
    }
    // 光の層を足す（ゲームの main.js と同じ。2026-11-05 まで足していなくて、エディタで遊ぶと光〈炎の照り返し・岩が崩れたときの光など〉が出なかった）
    renderer.present(out32, PAL32)
    ctx.putImageData(img, 0, 0)
    drawOverlay(t)
    drawMini()
  }
  requestAnimationFrame(frame)
}

floatWin($('signWin'), $('signBar'), 'reincarnation-editor-sign', () => ({ x: innerWidth - 300 - 420, y: 440, w: 410, h: 440 }), () => {})
floatWin($('toolsWin'), $('toolsBar'), 'reincarnation-editor-tools', () => ({ x: innerWidth - 300 - 290, y: 8, w: 280, h: 420 }), () => {})
floatWin($('viewWin'), $('viewBar'), 'reincarnation-editor-view', () => ({ x: 12, y: 8, w: Math.min(innerWidth - 330, 980), h: Math.min(innerHeight - 250, 760) }), () => fit())
fit()
makeTools()
selectTool(SELECT)   // はじめは「選ぶ」
load()
requestAnimationFrame(frame)
