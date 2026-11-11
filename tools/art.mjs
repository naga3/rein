#!/usr/bin/env node
// art/（PX-13h Pixel のグループ reincarnation）の絵を、ゲームが読む src/art.js にする。Pixel で保存すると動く（art/group.json の after）
//   node tools/art.mjs
//   art/reincarnation.gpl: 色の表（ゲームも Pixel もここを読む）→ src/palette.js も作る
//   art/<フォルダー>/<名前>.pic: 絵。ゲームは「フォルダー/名前」と絵の名前で引く（ART['player/player'].pics.stand）
// 候補（名前に ~ の付く絵）と、空の絵は入れない
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ART = join(ROOT, 'art')

const pal = []
for (const line of readFileSync(join(ART, 'reincarnation.gpl'), 'utf8').split('\n')) {
  const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)/.exec(line)
  if (m) pal.push({ hex: [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join(''), name: m[4] })
}

export function readPic(file) {
  const doc = { palette: null, colors: {}, pics: {}, anims: {} }
  let cur = null
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (/^\s/.test(line) && line.trim()) { if (cur) cur.push(line.trim()); continue }
    cur = null
    let m
    if ((m = /^palette\s+(\S+)$/.exec(line))) doc.palette = m[1]
    else if ((m = /^color\s+(\S)\s+(\d+)$/.exec(line))) doc.colors[m[1]] = +m[2]
    else if ((m = /^anim\s+(\S+)\s+(.+)$/.exec(line))) {
      const fr = m[2].trim().split(/\s+/).map((f) => /^([A-Za-z_][A-Za-z0-9_]*)(?::(\d+))?$/.exec(f)).filter(Boolean)
      doc.anims[m[1]] = { frames: fr.map((x) => x[1]), ms: fr.map((x) => Math.max(10, Math.min(5000, +(x[2] ?? 120)))) }
    }
    else if ((m = /^pic\s+(\S+)\s+(\d+)\s+(\d+)/.exec(line))) doc.pics[m[1]] = cur = []
  }
  return doc
}

const files = []
const walk = (dir) => {
  for (const f of readdirSync(dir).sort()) {
    if (f.startsWith('.')) continue
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (f.endsWith('.pic')) files.push(p)
  }
}
walk(ART)

const out = {}, errors = []
for (const file of files) {
  const ref = relative(ART, file).slice(0, -4)
  const doc = readPic(file)
  if (doc.palette !== 'reincarnation') errors.push(`${ref}: palette reincarnation の行が要る`)
  const one = { colors: {}, pics: {}, anims: doc.anims }
  for (const [name, rows] of Object.entries(doc.pics)) {
    if (name.includes('~') || rows.every((r) => /^\.*$/.test(r))) continue
    if (rows.some((r) => r.length !== rows[0].length)) { errors.push(`${ref} の ${name}: 行の長さがそろっていない`); continue }
    for (const ch of new Set(rows.join(''))) {
      if (ch === '.') continue
      if (!(ch in doc.colors) || !pal[doc.colors[ch]]) errors.push(`${ref} の ${name}: 色の決まっていない文字 ${ch}`)
      else one.colors[ch] = doc.colors[ch]
    }
    one.pics[name] = rows
  }
  out[ref] = one
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }

const write = (path, text) => { if (!existsSync(path) || readFileSync(path, 'utf8') !== text) { writeFileSync(path, text); return true } return false }
write(join(ROOT, 'src/palette.js'),
  '// 色の表（tools/art.mjs が art/reincarnation.gpl から作る。手で直さない。色は .gpl の後ろに足すだけで、並べ替え・消すはしない）\n' +
  '// パレット番号で描き、RGB は直接使わない。コードでは P.名前 で指す\nconst COLORS = [\n' + pal.map((c) => `  ['${c.name}', '${c.hex}'],`).join('\n') + '\n]\n\n' +
  'export const PAL_HEX = COLORS.map((c) => c[1])\nexport const P = Object.fromEntries(COLORS.map((c, i) => [c[0], i]))\n')
if (write(join(ROOT, 'src/art.js'), '// 絵（tools/art.mjs が art/*.pic から作る。手で直さない。絵は PX-13h Pixel のグループ reincarnation で描く）\nexport const ART = {\n' +
  Object.entries(out).map(([k, v]) => `  '${k}': ${JSON.stringify(v)},`).join('\n') + '\n}\n'))
  console.log(`src/art.js: ${Object.keys(out).length} ファイル、${Object.values(out).reduce((n, v) => n + Object.keys(v.pics).length, 0)} 枚`)
