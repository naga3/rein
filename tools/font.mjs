// 日本語のフォントを作る: node tools/font.mjs [字の名前]（npm run font）
//   src/ の .js と、地図（src/maps/*.json）の経典の場所の名前・部屋の名前に出てくる文字だけを取り出して src/font.js に書く。文を足したら、もう一度動かす
//   字の名前は art/font.json の font（無ければ k8x12）。引数で渡すと、それで作る（見比べ用）
//   k8x12: art/k8x12L.bdf（8x12 ドット、自由に使えるライセンス。art/k8x12-readme.txt）
//   2026-11-03 に東雲フォント（12・14・16 ドット）と見比べて、k8x12 のままにした（読めないのは字ではなく、背景と混ざる所だった。縁取りで直した）。
//   ほかの字を足すときは FONTS に足す。enc: unicode（番号が Unicode）・jis（JIS X 0208 の番号。EUC-JP として読む）・ascii
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'

const FONTS = {
  k8x12: { h: 12, files: [['k8x12L.bdf', 'unicode']] },
}
const art = (f) => new URL(`../art/${f}`, import.meta.url)
const conf = existsSync(art('font.json')) ? JSON.parse(readFileSync(art('font.json'), 'utf8')) : {}
const NAME = process.argv[2] || conf.font || 'k8x12'
const F = FONTS[NAME]
const H = F.h
const euc = new TextDecoder('euc-jp')

const glyphs = new Map()
for (const [file, enc] of F.files) {
  const bdf = readFileSync(art(file), 'utf8').split('\n')
  const ascent = Number(bdf.find((l) => l.startsWith('FONT_ASCENT')).split(/\s+/)[1])
  for (let i = 0; i < bdf.length; i++) {
    if (!bdf[i].startsWith('STARTCHAR')) continue
    let code = 0, dw = 8, bbx = [8, H, 0, 0]
    let j = i + 1
    for (; !bdf[j].startsWith('BITMAP'); j++) {
      const [k, ...v] = bdf[j].trim().split(/\s+/)
      if (k === 'ENCODING') code = Number(v[0])
      if (k === 'DWIDTH') dw = Number(v[0])
      if (k === 'BBX') bbx = v.map(Number)
    }
    i = j
    let cp = code
    if (enc === 'jis') { const e = code | 0x8080; const s = euc.decode(new Uint8Array([e >> 8, e & 0xff])); if (s.length !== 1 || s === '�') continue; cp = s.codePointAt(0) }
    if (enc === 'ascii' && (code < 0x20 || code > 0x7e)) continue
    if (glyphs.has(cp)) continue
    const [w, h, xo, yo] = bbx
    const rows = new Array(H).fill(0)
    for (let r = 0; r < h; r++) {
      const bits = parseInt(bdf[j + 1 + r], 16) >> (Math.ceil(w / 8) * 8 - w)
      const y = ascent - (yo + h) + r
      if (y >= 0 && y < H) rows[y] = (bits << (16 - w - xo)) & 0xffff
    }
    glyphs.set(cp, { dw, rows })
  }
}

// EUC-JP の読み方の違いで、同じ字が別の番号になるもの（〜 と ～ など）は、ある方を使う
for (const [a, b] of [[0x301c, 0xff5e], [0x2016, 0x2225], [0x2212, 0xff0d], [0x00a2, 0xffe0], [0x00a3, 0xffe1], [0x00ac, 0xffe2]]) {
  if (!glyphs.has(a) && glyphs.has(b)) glyphs.set(a, glyphs.get(b))
  if (!glyphs.has(b) && glyphs.has(a)) glyphs.set(b, glyphs.get(a))
}

const used = new Set()
for (let c = 0x20; c < 0x7f; c++) used.add(c)
const srcDir = new URL('../src/', import.meta.url)
for (const f of readdirSync(srcDir)) {
  if (!f.endsWith('.js') || f === 'font.js' || f === 'editor.js') continue   // エディタの文字は画面のフォントで出すので要らない
  for (const ch of readFileSync(new URL(f, srcDir), 'utf8')) if (ch.codePointAt(0) >= 0x80) used.add(ch.codePointAt(0))
}
// 地図（src/maps/*.json）の経典の場所の名前と部屋の名前も（エディタで書き足すので）
const mapDir = new URL('../src/maps/', import.meta.url)
for (const f of readdirSync(mapDir)) {
  if (!f.endsWith('.json')) continue
  for (const r of JSON.parse(readFileSync(new URL(f, mapDir), 'utf8')).rooms) for (const ch of (r.place || '') + (r.name || '')) if (ch.codePointAt(0) >= 0x80) used.add(ch.codePointAt(0))   // 部屋の名前も（ゲームの右上に出す。2026-11-08 まで拾っていなかった）
}
// 看板の文（src/signs.json）も
for (const ch of readFileSync(new URL('signs.json', srcDir), 'utf8')) if (ch.codePointAt(0) >= 0x80) used.add(ch.codePointAt(0))
const out = []
for (const c of [...used].sort((a, b) => a - b)) {
  const g = glyphs.get(c)
  if (!g) continue
  out.push(`${JSON.stringify(String.fromCodePoint(c))}:'${g.dw.toString(16).padStart(2, '0')}${g.rows.map((r) => r.toString(16).padStart(4, '0')).join('')}'`)
}
const text = `// tools/font.mjs が ${NAME} から作る。手で直さない。値は 幅(16進 2 桁) + FONT_H 行(各 4 桁、ビット 15 が左端)。読むのは src/glyph.js\n` +
  `export const FONT = '${NAME}', FONT_H = ${H}\nexport const GLYPHS = {\n${out.join(',\n')}\n}\n`
// 中身が変わったときだけ書く（npm run dev のとき、文を書き換えるたびに動くので。src/font.js が無駄に書き換わらないように）
const file = new URL('font.js', srcDir)
let before = ''
try { before = readFileSync(file, 'utf8') } catch {}
if (before !== text) writeFileSync(file, text)
console.log(NAME, 'glyphs', out.length)
