// 録った操作（rec/<名前>.json。src/rec.js）を再現して、動画（mp4）にする。開発中だけの道具（2026-11-14）
//   node tools/video.mjs <名前> [--lang ja|en] [--from 秒] [--to 秒] [--size 1920x1080|1080x1080|1280x960] [--out video/<名前>.mp4]
//   画面: 画面なしのブラウザで ?replay=<名前> を開き、1 コマずつ進めて 320×240 を取り出し、ffmpeg でドットのまま拡大する（60 コマ／秒）
//   音: 再現の間に曲と効果音を変えたコマを覚えておき、public/audio/*.ogg を同じ時刻に重ねる（src/music.js と同じ決まり: 曲の入れ替えは 0.25 秒の時定数で、繰り返す曲は止めた所の続きから）
//   確かめ: 録ったときの主人公の位置（0.5 秒ごと）と食い違ったら知らせる（再現がずれた）
import fs from 'node:fs'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'vite'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('/home/naga3/src/etc/enso/node_modules/playwright')
const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`
const PORT = 15045   // 確かめ用の区画（~/src/etc/PORTS.md。本体は 15040）

const args = process.argv.slice(2)
const name = args.find((a) => !a.startsWith('--'))
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
if (!name || !fs.existsSync(`rec/${name}.json`)) { console.error('使い方: node tools/video.mjs <rec/ の名前> [--lang ja|en] [--from 秒] [--to 秒] [--size 1920x1080|1080x1080|1280x960] [--out パス]'); process.exit(1) }
const lang = opt('lang', 'ja')
const size = opt('size', '1920x1080')
const out = opt('out', `video/${name}-${lang}.mp4`)
const FPS = 60, W = 320, H = 240, SR = 48000
const rec = JSON.parse(fs.readFileSync(`rec/${name}.json`, 'utf8'))
const from = Math.max(0, Math.round(Number(opt('from', 0)) * FPS))
const to = Math.min(rec.steps, Math.round(Number(opt('to', rec.steps / FPS)) * FPS))
if (to <= from) { console.error('--from と --to の範囲が空'); process.exit(1) }
fs.mkdirSync(path.dirname(out), { recursive: true })
const tmp = `video/zz-${name}-${lang}`

// 拡大と余白: 整数倍で、背景はゲームの外の色
const [OW, OH] = size.split('x').map(Number)
const k = Math.max(1, Math.min(Math.floor(OW / W), Math.floor(OH / H)))
const vf = `scale=${W * k}:${H * k}:flags=neighbor,pad=${OW}:${OH}:(ow-iw)/2:(oh-ih)/2:color=0x0d0b14`

// ---- 画面 ----
const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'error', clearScreen: false })
await server.listen()
const browser = await chromium.launch({ executablePath: EXE })
let audioLog, firstKey, misses
try {
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${PORT}/?replay=${encodeURIComponent(name)}&lang=${lang}${rec.at ? `&at=${encodeURIComponent(rec.at)}` : ''}`)
  await page.waitForFunction(() => window.__rep, null, { timeout: 30000 })
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', `${tmp}.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] })
  const write = (buf) => new Promise((ok) => (ff.stdin.write(buf) ? ok() : ff.stdin.once('drain', ok)))
  let s = 0
  const BATCH = 20
  while (s < to) {
    const n = Math.min(BATCH, s < from ? from - s : to - s)
    const grab = s >= from
    const b64 = await page.evaluate(([n, g]) => window.__rep.run(n, g), [n, grab])
    if (grab) await write(Buffer.from(b64, 'base64'))
    s += n
    if (s % 600 < n) process.stdout.write(`\r画面 ${(s / FPS).toFixed(0)} / ${(to / FPS).toFixed(0)} 秒`)
  }
  ff.stdin.end()
  await new Promise((ok) => ff.on('close', ok))
  process.stdout.write('\n')
  ;({ audioLog, firstKey, misses } = await page.evaluate(() => ({ audioLog: window.__rep.audioLog, firstKey: window.__rep.firstKey, misses: window.__rep.misses })))
} finally {
  await browser.close()
  await server.close()
}
if (misses.length) console.log(`注意: 録ったときと再現がずれた所がある（最初: ${(misses[0].want[0] / FPS).toFixed(1)} 秒）`, JSON.stringify(misses.slice(0, 3)))
else console.log('再現は、録ったときと一致した')

// ---- 音 ----
const GROUP = JSON.parse(fs.readFileSync('music/group.json', 'utf8'))
const VOL = GROUP.volume || {}, MASTER = GROUP.mix?.master ?? 0.6
const volOf = (n) => VOL[n] ?? 1
const bgmSrc = fs.readFileSync('src/bgm.js', 'utf8')
const LOOP = Object.fromEntries([...bgmSrc.matchAll(/(\w+): \{ loop: (true|false) \}/g)].map((m) => [m[1], m[2] === 'true']))
const FROM_TOP = new Set(['light']), NO_FADE_IN = new Set(['end']), TC = 0.25
const pcm = new Map()
const decode = (n) => {
  if (!pcm.has(n)) {
    const f = `public/audio/${n}.ogg`
    pcm.set(n, fs.existsSync(f) ? new Float32Array(new Uint8Array(execFileSync('ffmpeg', ['-loglevel', 'error', '-i', f, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 })).buffer) : null)
  }
  return pcm.get(n)
}
// 曲の流れ（src/music.js の start と同じ決まり）を、区切りの並びにする
const segs = [], resumeAt = new Map()
let cur = null, want = null, wantResume = false, unlocked = false
const start = (n, resume, at) => {
  if (cur) {
    const d = cur.buf.length / 2 / SR
    if (cur.loop && !FROM_TOP.has(cur.name)) resumeAt.set(cur.name, (cur.offset + at - cur.at) % d)
    cur.fadeAt = at
    cur = null
  }
  if (!n || !(n in LOOP)) return
  const buf = decode(n)
  if (!buf) return
  const d = buf.length / 2 / SR, loop = LOOP[n]
  cur = { name: n, buf, loop, at, offset: loop && resume ? (resumeAt.get(n) ?? 0) % d : 0, fadeIn: !NO_FADE_IN.has(n), vol: volOf(n) * MASTER, fadeAt: null }
  segs.push(cur)
}
const sfxs = []
const unlockStep = firstKey ?? Infinity
let li = 0
for (let step = 0; step <= to; step++) {
  const at = step / FPS
  if (!unlocked && step >= unlockStep) { unlocked = true; if (want) start(want, wantResume, at) }
  while (li < audioLog.length && audioLog[li][0] === step) {
    const e = audioLog[li++]
    if (e[1] === 'play') { want = e[2]; wantResume = e[3]; if (unlocked) start(want, wantResume, at) }
    else if (unlocked) { const b = decode(`sfx-${e[2]}`); if (b) sfxs.push({ buf: b, at, vol: volOf(`sfx-${e[2]}`) * MASTER }) }
  }
}
const t0 = from / FPS, N = Math.round(((to - from) / FPS) * SR)
const mix = new Float32Array(N * 2)
for (const g of segs) {
  const len = g.buf.length / 2
  const stop = g.fadeAt == null ? Infinity : g.fadeAt + 1.5
  const gAt = (t) => { const r = t - g.at; return g.fadeIn ? g.vol * (1 - Math.exp(-r / TC)) : g.vol }
  const gEnd = g.fadeAt == null ? 0 : gAt(g.fadeAt)
  const i0 = Math.max(0, Math.round((g.at - t0) * SR)), i1 = Math.min(N, Math.round((Math.min(stop, t0 + N / SR) - t0) * SR))
  for (let i = i0; i < i1; i++) {
    const t = t0 + i / SR
    let p = Math.round((t - g.at + g.offset) * SR)
    if (g.loop) p %= len; else if (p >= len) break
    const v = g.fadeAt != null && t > g.fadeAt ? gEnd * Math.exp(-(t - g.fadeAt) / TC) : gAt(t)
    mix[i * 2] += g.buf[p * 2] * v; mix[i * 2 + 1] += g.buf[p * 2 + 1] * v
  }
}
for (const f of sfxs) {
  const len = f.buf.length / 2, i0 = Math.round((f.at - t0) * SR)
  for (let j = Math.max(0, -i0); j < len && i0 + j < N; j++) { mix[(i0 + j) * 2] += f.buf[j * 2] * f.vol; mix[(i0 + j) * 2 + 1] += f.buf[j * 2 + 1] * f.vol }
}
// WAV（16 bit）に書いて、画面とまとめる
const wav = Buffer.alloc(44 + N * 4)
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22)
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 4, 40)
for (let i = 0; i < N * 2; i++) wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mix[i] * 32767))), 44 + i * 2)
fs.writeFileSync(`${tmp}.wav`, wav)
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${tmp}.mp4`, '-i', `${tmp}.wav`, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out])
fs.rmSync(`${tmp}.mp4`); fs.rmSync(`${tmp}.wav`)
console.log(`できた: ${out}（${((to - from) / FPS).toFixed(1)} 秒、${OW}×${OH}、${k} 倍）`)
