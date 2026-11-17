// 遊んだ操作を録って、そのまま再現する（開発中だけ。2026-11-14。紹介動画づくり用。動画にするのは tools/video.mjs）
//   録る:   デバッグの並びの「録画」を押す（読み直して、タイトルから録る）。もう一度押すか F8 で、rec/<名前>.json に保存（vite.config.js の /__rec）
//   再現:   ?replay=<名前>&lang=ja|en。ループは回さず、tools/video.mjs が window.__rep で 1 コマずつ進めて画面を取り出す
//   同じに再現するために: 乱数（Math.random）は決まった並び。記録は、録り始めたときの localStorage の写しから（本物の記録には書かない）。
//   コマごとの入力（input.read() の結果）と、メニューへのキー（menu.onKey）と、フォーカスが外れた時（ポーズ）を、コマの番号つきで覚える
const q = new URLSearchParams(location.search)
// 録るかどうかは、「録画」を押したときに sessionStorage に置いた印で決める（読み直した一回だけ）
export const REC = import.meta.env.DEV && sessionStorage.getItem('reincarnation-rec') === '1'
if (REC) sessionStorage.removeItem('reincarnation-rec')
export const REPLAY = import.meta.env.DEV && q.get('replay') ? q.get('replay') : null

// 乱数を決まった並びに（mulberry32）
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
// 記録の置き場を、写しのメモリーに差しかえる（本物の localStorage には書かない）
function memStorage(init) {
  const m = new Map(Object.entries(init || {}))
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)) }, removeItem: (k) => { m.delete(k) }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size } }
}
const SEED = 20261114
let data = null
if (REC || REPLAY) {
  let snap = {}
  if (REPLAY) data = await fetch(`/__rec/${encodeURIComponent(REPLAY)}`).then((r) => r.json())
  else { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('reincarnation')) snap[k] = localStorage.getItem(k) } }
  if (REPLAY) snap = data.storage
  const lang = q.get('lang')
  if (lang) snap['reincarnation-lang'] = lang
  Object.defineProperty(window, 'localStorage', { value: memStorage(snap), configurable: true })
  Math.random = seeded(SEED)
  window.open = () => null   // 看板の原典を開く（X）は、録る間・再現の間は開かない
  if (REC) { data = { storage: snap, inputs: [], keys: [], blurs: [], checks: [], steps: 0, lang: q.get('lang') || null, at: q.get('at') || null } }   // at: ?at= の場所から始めたとき（tools/video.mjs が再現にも付ける）
}

// 録る側（main.js から呼ぶ）
let lastInp = ''
export const rec = REC ? {
  inp(step, inp) { const s = JSON.stringify(inp); if (s !== lastInp) { data.inputs.push([step, inp]); lastInp = s } },
  key(step, e) { data.keys.push([step, e.key, e.code]) },
  blur(step) { data.blurs.push(step) },
  check(step, S, mode) { if (step % 30 === 0) data.checks.push([step, mode, S.realm, S.lifeNo, Math.round((S.player?.x ?? 0) * 100), Math.round((S.player?.y ?? 0) * 100)]) },
  async save(step) {
    data.steps = step
    const name = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
    const r = await fetch(`/__rec/${name}`, { method: 'POST', body: JSON.stringify(data) })
    return r.ok ? name : null
  },
} : null

// 再現する側: コマの番号ごとに、入力・メニューへのキー・ポーズを引けるようにする
export const rep = REPLAY ? (() => {
  const inputs = data.inputs, keys = new Map(), blurs = new Set(data.blurs), checks = new Map()
  for (const [s, key, code] of data.keys) { if (!keys.has(s)) keys.set(s, []); keys.get(s).push({ key, code }) }
  for (const c of data.checks) checks.set(c[0], c)
  let i = 0, cur = {}
  return {
    steps: data.steps,
    firstKey: data.keys.length ? data.keys[0][0] : null,   // 音が鳴りはじめるコマ（ブラウザの決まりで、最初のキーから）
    inp(step) { while (i < inputs.length && inputs[i][0] <= step) cur = inputs[i++][1]; return { ...cur } },   // 写しを渡す（ゲームが書きかえても、次のコマに残らないように）
    keys: (step) => keys.get(step) || [],
    blur: (step) => blurs.has(step),
    check(step, S, mode) {
      const c = checks.get(step)
      if (!c) return null
      const now = [step, mode, S.realm, S.lifeNo, Math.round((S.player?.x ?? 0) * 100), Math.round((S.player?.y ?? 0) * 100)]
      return JSON.stringify(now) === JSON.stringify(c) ? null : { want: c, got: now }
    },
  }
})() : null
