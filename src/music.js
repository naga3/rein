// BGM を流す（WebAudio）。曲は public/audio/<名前>.ogg（tools/audio.mjs が Music の曲から作る。どれがあるかは src/bgm.js）
//   ブラウザの決まりで、最初にキーか画面に触れたときから鳴る。曲が変わるときは、0.8 秒かけて入れ替える。M で消す（覚えておく）
//   繰り返す曲は、止めた所を覚えておき、次に同じ曲を流すときはその続きから（光の部屋を出たら、道の曲が入る前の続きから）
import { BGM } from './bgm.js'
import { SFX } from './sfx.js'
import GROUP from '../music/group.json' with { type: 'json' }
// 曲ごとの音量（music/group.json の volume。1 がそのまま。PX-13h Music の「ゲームの音量」のつまみと tools/music/volume.js で変える。2026-11-07）
//   書き出し（tools/audio.mjs）はどの曲も大きさをそろえるので、曲ごとの差はここで掛ける。変えたらページを読み直さずに効く
let VOL = GROUP.volume || {}
const volOf = (name) => VOL[name] ?? 1
const MASTER = GROUP.mix?.master ?? 0.6   // 全体の音量（music/group.json の mix.master。Music の「ゲームの大きさで聴く」も同じ値を使う）

const MUTE_KEY = 'reincarnation-mute'
export function createMusic() {
  let ctx = null, master = null, cur = null, want = null
  const cache = new Map()
  const resumeAt = new Map()   // 曲の名前 → 止めたときの位置（秒）。繰り返す曲は、次に流すときそこから（光の部屋を出たら、入る前の続きから。2026-11-06）
  const FROM_TOP = new Set(['light'])
  const NO_FADE_IN = new Set(['end'])   // フェードインせず、いきなり鳴らす曲（解脱の終わりの曲。輪が切れて静かになったあとに。2026-11-08）   // いつも最初から流す曲（光の部屋の曲。見つけた瞬間・入るたびに頭から）
  let muted = false
  try { muted = localStorage.getItem(MUTE_KEY) === '1' } catch {}
  const unlock = () => {
    if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = muted ? 0 : MASTER; master.connect(ctx.destination) }
    if (ctx.state === 'suspended') ctx.resume()
    if (want && (!cur || cur.name !== want)) start(want)
    for (const n of SFX) if (!sfxBufs.has(`sfx-${n}`)) load(`sfx-${n}`).then((b) => sfxBufs.set(`sfx-${n}`, b))   // 効果音は先に読んでおく（鳴らす瞬間に遅れないように）
  }
  for (const ev of ['keydown', 'pointerdown', 'touchstart']) addEventListener(ev, unlock, { passive: true })
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'm' || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA)$/.test(e.target?.tagName)) return
    muted = !muted
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0') } catch {}
    if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05)
  })
  const load = (name) => {
    if (!cache.has(name)) cache.set(name, fetch(`audio/${name}.ogg`).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).catch(() => null))
    return cache.get(name)
  }
  async function start(name) {
    const old = cur
    cur = { name, src: null, gain: null }
    const me = cur
    if (old?.src && old.loop && !FROM_TOP.has(old.name)) resumeAt.set(old.name, (old.offset + ctx.currentTime - old.started) % old.src.buffer.duration)
    if (old?.gain) { old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.25); const s = old.src; setTimeout(() => { try { s.stop() } catch {} }, 1500) }
    if (!name || !BGM[name]) return
    const buf = await load(name)
    if (!buf || cur !== me) return
    const src = ctx.createBufferSource(), gain = ctx.createGain()
    src.buffer = buf; src.loop = BGM[name].loop
    if (NO_FADE_IN.has(name)) gain.gain.value = volOf(name)
    else { gain.gain.value = 0; gain.gain.setTargetAtTime(volOf(name), ctx.currentTime, 0.25) }
    const offset = src.loop && wantResume ? (resumeAt.get(name) ?? 0) % buf.duration : 0
    src.connect(gain); gain.connect(master); src.start(0, offset)
    me.src = src; me.gain = gain; me.loop = src.loop; me.offset = offset; me.started = ctx.currentTime
  }
  // 毎コマ呼ぶ: 流したい曲の名前（無ければ null で静かに）
  // resume: 止めた所の続きから流すか（光の部屋を出たときだけ。ゲームを始めたとき・次の道へ進んだときなど、区切りの場面は頭から。2026-11-07）
  let wantResume = false
  const play = (name, { resume = false } = {}) => {
    if (name === want) return
    want = name; wantResume = resume
    if (ctx && ctx.state !== 'suspended') start(name)
  }
  import.meta.hot?.accept('../music/group.json', (m) => {
    VOL = m?.default?.volume || {}
    if (cur?.gain && ctx) cur.gain.gain.setTargetAtTime(volOf(cur.name), ctx.currentTime, 0.1)   // 流れている曲にも、すぐ効かせる
  })
  // 効果音（2026-11-07）: 1 回だけ鳴らす。public/audio/sfx-<名前>.ogg（src/sfx.js にある名前だけ）。曲と同じ全体の音量（M で消える）と、volume の sfx-<名前> を掛ける。
  //   読み終わっていなければ鳴らさない（遅れて鳴るより、鳴らないほうがよい）
  const sfxBufs = new Map()
  const playBuf = (key, buf) => {
    const src = ctx.createBufferSource(), gain = ctx.createGain()
    src.buffer = buf; gain.gain.value = volOf(key)
    src.connect(gain); gain.connect(master); src.start()
  }
  // 最初の 1 回（音の出口を作った直後）は、まだ読み終わっていない・動き出していないことがある。
  //   そのときは、用意ができしだい鳴らす（頼まれてから 0.3 秒以内なら。それより遅れたら鳴らさない。2026-11-07。最初の一回だけ鳴らなかった）
  const sfx = (name) => {
    if (!SFX.includes(name)) return
    if (!ctx) unlock()
    const key = `sfx-${name}`, asked = performance.now()
    const ready = sfxBufs.get(key)
    if (ready && ctx.state === 'running') { playBuf(key, ready); return }
    Promise.all([ready || load(key).then((b) => (sfxBufs.set(key, b), b)), ctx.state === 'running' ? null : ctx.resume()]).then(([buf]) => {
      if (buf && performance.now() - asked < 300) playBuf(key, buf)
    })
  }
  return { play, sfx }
}
