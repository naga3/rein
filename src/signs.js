// 看板（地図の B、岩の中の看板は b）。下キーで読む。読んだ看板は記録に残る（コレクション。タイトルの「看板」で見返せる）
//   地図の部屋に "signs": { "x,y": "<番号>" } を書くと、部屋の中のそのマスの B がその看板になる（2026-11-05 に部屋ごとに一つから、看板ごとに変えた。たくさん置いて集めるので）。言葉は経典のパーリ語原文から直接訳す（出典は docs/sources.md）
//   lines: 窓に出す行（一行は日本語で 30 字、英語で 48 字くらいまで）。source: 出典。page: 初期仏典を読む（sutta.ponk.jp。~/src/etc/sutta）のその節のページ（窓の中で決定を押すと開く）
export const SUTTA_SITE = 'https://sutta.ponk.jp'
export const signUrl = (id, lang) => SIGNS[id]?.page ? `${SUTTA_SITE}/${lang === 'en' ? 'en' : 'ja'}/${SIGNS[id].page}` : null
// 中身は src/signs.json（2026-11-05 に、ステージエディタの看板の窓で直せるよう JSON に移した。エディタは /__signs で読み書きする）
//   { 番号: { note: メモ, page, ja: { lines, source }, en: { lines, source } } }
import data from './signs.json' with { type: 'json' }
import { buildWorld, TILE, K } from './world.js'
export const SIGNS = { ...data }
// 看板の文が書き換えられたら、ページを読み直さずに中身だけ入れ替える（エディタの編集が消えないように）
import.meta.hot?.accept('./signs.json', (m) => { if (!m) return; for (const k of Object.keys(SIGNS)) delete SIGNS[k]; Object.assign(SIGNS, m.default) })

// 地図の看板の数（記録の「読んだ看板 n / 全部」の全部）
// 地図に置いてある看板の番号（部屋の signs のうち、そのマスが本当に B のもの）
export const placedSigns = (rooms) => rooms.flatMap((r) => Object.entries(r.signs || {}).filter(([k]) => { const [x, y] = k.split(',').map(Number); return r.rows[y]?.[x] === 'B' || r.rows[y]?.[x] === 'b' }).map(([, id]) => id))
// 地図に置いてある看板の番号を、置いた順に（部屋の順、部屋の中は上の段から左から。同じ番号は一度だけ）。看板の一覧の並び
export function signsInOrder(rooms) {
  const out = []
  for (const r of rooms) r.rows.forEach((row, y) => [...row].forEach((c, x) => { const id = (c === 'B' || c === 'b') && r.signs?.[`${x},${y}`]; if (id && !out.includes(id)) out.push(id) }))
  return out
}
export const signCount = (maps) => new Set(Object.values(maps).flatMap(placedSigns)).size

// 並びは、はじまりからの道のりが近い順（2026-11-06）: はじまりのマスから、岩以外のマス〈すり抜けの岩・扉も〉を上下左右にたどった歩数。
//   遊ぶ順になんとなく沿う（前は部屋が地図のファイルに書かれた順で、同じ部屋の隠し看板がはじまりの看板より先に来ていた）。届かない看板は後ろに
const signOrderCache = new Map()
export const signOrder = (maps, r) => {
  if (signOrderCache.has(r)) return signOrderCache.get(r)
  const ids = signsInOrder(maps[r]), w = buildWorld(maps[r], { strict: false, realm: r })
  const dist = new Int32Array(w.w * w.h).fill(-1)
  if (w.start) {
    const s0 = Math.floor((w.start.y - 1) / TILE) * w.w + Math.floor(w.start.x / TILE), q = [s0]; dist[s0] = 0
    for (let h = 0; h < q.length; h++) { const c = q[h], x = c % w.w, y = (c / w.w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue; const n = ny * w.w + nx; if (dist[n] >= 0 || w.t[n] === K.rock) continue; dist[n] = dist[c] + 1; q.push(n) } }
  }
  const d = new Map(); for (const g of w.signs) if (g.id && !d.has(g.id)) d.set(g.id, dist[g.ty * w.w + g.tx] < 0 ? Infinity : dist[g.ty * w.w + g.tx])
  const out = [...ids].sort((a, b) => (d.get(a) ?? Infinity) - (d.get(b) ?? Infinity) || ids.indexOf(a) - ids.indexOf(b))
  signOrderCache.set(r, out)
  return out
}

// 原典のページを新しいタブで開く。ふつうのリンクを押したのと同じ開き方（window.open より、ブラウザに止められにくい）。
//   キーや指・クリックのイベントの中で呼ぶ（そうでないとブラウザが止める）
export function openSignPage(id, lang) {
  const url = signUrl(id, lang)
  if (url) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove() }
}
