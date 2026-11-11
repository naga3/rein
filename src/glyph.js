// 字の形（src/font.js。tools/font.mjs が作る）を読む。どの字の大きさ（8x12・12x12・16x16 など）でも同じ形で返す
//   glyph(ch): { w（送り幅）, rows（FONT_H 行。各行はビット 15 が左端） }。無い字は null
import { GLYPHS, FONT_H } from './font.js'
export { FONT_H }
const cache = new Map()
// フォントが作り直されたら（文や看板を書き足したとき）、ページを読み直さずに字だけ入れ替える（エディタの編集が消えないように。字の大きさは変わらない前提）
let G = GLYPHS
import.meta.hot?.accept('./font.js', (m) => { if (m) { G = m.GLYPHS; cache.clear() } })
const parse = (g) => ({ w: parseInt(g.slice(0, 2), 16), rows: Array.from({ length: FONT_H }, (_, i) => parseInt(g.slice(2 + i * 4, 6 + i * 4), 16)) })
// フォントに無い、記号の付いた字（パーリ語の ā・ḷ・ṅ・ñ など）: 元の字に、横棒（長音・波）・上の点・下の点を足して作る（2026-11-09。前は空白になっていた）
const MARKS = { '\u0304': 'bar', '\u0303': 'bar', '\u0307': 'above', '\u0323': 'below' }
function marked(ch) {
  const d = ch.normalize('NFD'), base = G[d[0]]
  if (d.length < 2 || !base || ![...d.slice(1)].every((m) => MARKS[m])) return null
  const v = parse(base), rows = v.rows
  let top = rows.findIndex((r) => r), bottom = FONT_H - 1 - [...rows].reverse().findIndex((r) => r), all = rows.reduce((a, r) => a | r, 0)
  if (top < 0) return null
  // 上に付ける印のための空きが無ければ（大文字）、字を下へずらす
  const need = [...d.slice(1)].some((m) => MARKS[m] !== 'below') ? 2 - top : 0
  if (need > 0 && bottom + need < FONT_H) { rows.splice(FONT_H - need, need); rows.unshift(...Array(need).fill(0)); top += need; bottom += need }
  let lo = 15, hi = 0
  for (let i = 0; i < 16; i++) if (all & (0x8000 >> i)) { lo = Math.min(lo, i); hi = Math.max(hi, i) }
  const mid = 0x8000 >> Math.round((lo + hi) / 2), bar = Array.from({ length: hi - lo + 1 }, (_, k) => 0x8000 >> (lo + k)).reduce((a, b) => a | b, 0)
  for (const m of d.slice(1)) {
    if (MARKS[m] === 'bar') rows[Math.max(0, top - 2)] |= bar
    else if (MARKS[m] === 'above') rows[Math.max(0, top - 2)] |= mid
    else rows[Math.min(FONT_H - 1, bottom + 2)] |= mid
  }
  return v
}
export function glyph(ch) {
  if (cache.has(ch)) return cache.get(ch)
  const g = G[ch]
  const v = g ? parse(g) : marked(ch)
  if (v) cache.set(ch, v)   // 無い字は覚えない（看板の文が先に届き、字があとから足されたときも、すぐ描けるように。2026-11-06）
  return v
}
// 字の並びの幅（無い字は字の高さの半分）
export const textWidth = (s, k = 1) => [...s].reduce((w, ch) => w + (glyph(ch)?.w ?? (FONT_H >> 1)) * k, 0)
// 一つの字の点を並べる: dot(x, y) を、点のある所で呼ぶ
export function eachDot(g, fn) { for (let j = 0; j < FONT_H; j++) { const r = g.rows[j]; if (r) for (let i = 0; i < 16; i++) if (r & (0x8000 >> i)) fn(i, j) } }
