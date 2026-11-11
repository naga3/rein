#!/usr/bin/env node
// BGM（music/<名前>.song。PX-13h Music で編集）を、PX-13h の音源（Music と同じ engine.wasm）で鳴らして書き出す。
//   public/audio/<名前>.ogg と、ゲームが読む src/bgm.js（どの曲があるかと、繰り返すか。ogg は vite がそのまま配る）
//   node tools/audio.mjs            全部
//   node tools/audio.mjs stage boss 指定したものだけ（src/bgm.js は、ほかの曲は今の audio/*.ogg から作り直す）
// Music で保存すると動く（music/group.json の after）。PX-13h の場所は環境変数 PX13H（既定は ../px13h）。ffmpeg が要る（lab/witchs-treat の tools/audio.mjs と同じ作り）
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'fs'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'

// peak は書き出すときの音の大きさ（0〜1）、loop は繰り返すか（ゲームで 1 周分を切れ目なく回す）
const BGM = {
  hell: { peak: 0.5, loop: true },     // 地獄
  animal: { peak: 0.5, loop: true },   // 畜生
  peta: { peak: 0.5, loop: true },     // 餓鬼
  human: { peak: 0.5, loop: true },    // 人
  deva: { peak: 0.5, loop: true },     // 天
  last: { peak: 0.5, loop: true },     // 再び人（人パート 2）
  end: { peak: 0.5, loop: false },     // 解脱（1 回だけ）
  light: { peak: 0.45, loop: true },   // 光の部屋（見つけたあと。見つける前の光の部屋は曲なし。2026-11-06）
}

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
// 書き出す大きさは music/group.json の mix（peak・peaks）が決める（2026-11-07。PX-13h Music の「ゲームの大きさで聴く」と同じ値を使うため。下の BGM の peak は、mix が無いときだけ）
const MIX = JSON.parse(readFileSync(join(root, 'music/group.json'), 'utf8')).mix || {}
const peakOf = (name, def) => MIX.peaks?.[name] ?? MIX.peak ?? def.peak
const px = resolve(process.env.PX13H || join(root, '../px13h'))
const { Engine } = await import(join(px, 'tools/music/web/engine.js'))
const { parseSong, compose, analyze, buildTracks, engineSong } = await import(join(px, 'tools/music/web/song.js'))
const { defaultEnvelopes } = await import(join(px, 'tools/music/lib.js'))
const wasm = readFileSync(join(px, 'tools/music/web/engine.wasm'))
const OUT = join(root, 'public/audio')
const RATE = 48000
mkdirSync(OUT, { recursive: true })

async function render(S, loop, seconds) {
  const e = await Engine.load(wasm)
  e.setSong(engineSong(S.song, buildTracks(S.song, S.composed, S.a, -Infinity, Infinity, loop), defaultEnvelopes()))
  e.play()
  const chunks = []
  let n = 0
  const limit = (seconds || 60) * RATE
  while (n < limit && (loop || e.playing())) {
    chunks.push(Int16Array.from(e.render(800)))
    n += 800
  }
  const all = new Int16Array(n)
  let o = 0
  for (const c of chunks) { all.set(c, o); o += c.length }
  return all
}
// 繰り返しの 1 周分を取り出す。2 周目を切り出すので、1 周目の余韻が頭に重なって、つなぎ目が自然になる
//   1 周の長さは、曲の実際の長さ（analyze の total。全音符で数える）から。2026-11-06 までは「小節の数 × 4 拍」で、
//   6/8 の曲（畜生）では長すぎて、途中から始まり、継ぎ目で飛んでいた
async function renderLoop(S) {
  const period = Math.round(((S.a.total * 4 * 60) / S.song.tempo) * RATE)
  return (await render(S, true, (period * 2 + 2400) / RATE)).slice(period, period * 2)
}
function trimSilence(s) {
  let end = s.length
  while (end > 0 && Math.abs(s[end - 1]) < 60) end--
  return s.slice(0, Math.min(s.length, end + 480))
}
function normalize(s, peak) {
  let p = 0
  for (const v of s) p = Math.max(p, Math.abs(v))
  const g = p ? (peak * 32767) / p : 1
  return Int16Array.from(s, (v) => Math.round(v * g))
}
function writeOgg(name, s) {
  const data = Buffer.from(s.buffer, s.byteOffset, s.byteLength)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28)
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40)
  const wav = `/tmp/reincarnation-${name}.wav`
  writeFileSync(wav, Buffer.concat([h, data]))
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '3', join(OUT, `${name}.ogg`)])
  unlinkSync(wav)
  console.log(`public/audio/${name}.ogg  ${(s.length / RATE).toFixed(2)} 秒`)
}
// 曲を読む。書き間違い・長さのずれがあれば止める。選んだ候補（.picks.json）も当てはめる
function loadSong(name) {
  const file = join(root, 'music', `${name}.song`)
  const song = parseSong(readFileSync(file, 'utf8'))
  const pf = file.replace(/\.song$/, '.picks.json')
  const composed = compose(song, existsSync(pf) ? JSON.parse(readFileSync(pf, 'utf8')) : {})
  const a = analyze(song, composed)
  const errors = [...song.errors, ...a.errors]
  if (errors.length) { console.error(`${name}.song:\n  ${errors.join('\n  ')}`); process.exit(1) }
  return { song, composed, a }
}

const want = process.argv.slice(2)
// 効果音（2026-11-07）: music/sfx-<名前>.song を、1 回きりの音として書き出す（public/audio/sfx-<名前>.ogg）。大きさは BGM と同じく mix の peak でそろえ、差は volume で
for (const f of readdirSync(join(root, 'music')).filter((f) => /^sfx-[\w-]+\.song$/.test(f))) {
  const name = f.slice(0, -5)
  if (want.length && !want.includes(name)) continue
  writeOgg(name, normalize(trimSilence(await render(loadSong(name), false, 5)), peakOf(name, { peak: 0.5 })))
}
for (const [name, def] of Object.entries(BGM)) {
  if (want.length && !want.includes(name)) continue
  if (!existsSync(join(root, 'music', `${name}.song`))) { console.log(`music/${name}.song が無いので飛ばす`); continue }
  const S = loadSong(name)
  writeOgg(name, normalize(def.loop ? await renderLoop(S) : trimSilence(await render(S, false)), peakOf(name, def)))
}
// src/bgm.js: { 名前: { loop } }（書き出した曲だけ。ogg は public/audio/<名前>.ogg）
const lines = Object.entries(BGM).filter(([n]) => existsSync(join(OUT, `${n}.ogg`))).map(([n, d]) => `  ${n}: { loop: ${d.loop} },`)
writeFileSync(join(root, 'src/bgm.js'), `// BGM（tools/audio.mjs が music/*.song から作る。手で直さない）\nexport const BGM = {\n${lines.join('\n')}\n}\n`)
console.log(`src/bgm.js: ${lines.length} 曲`)
// src/sfx.js: 書き出した効果音の名前（sfx- を除いたもの。ogg は public/audio/sfx-<名前>.ogg）
const sfx = readdirSync(OUT).filter((f) => /^sfx-[\w-]+\.ogg$/.test(f)).map((f) => f.slice(4, -4)).sort()
writeFileSync(join(root, 'src/sfx.js'), `// 効果音（tools/audio.mjs が music/sfx-*.song から作る。手で直さない）\nexport const SFX = ${JSON.stringify(sfx)}\n`)
console.log(`src/sfx.js: ${sfx.length} 音`)
