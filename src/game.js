// ゲームの流れ（描画なし）: 生と死、花、部屋とカメラ、保存
import { buildWorld, TILE, deadly, spikeAt, roomAt, groundBelow, hiddenTouched, openHidden, openDoorsOf, openDoor, doorTouched, tileAt, isSolidKind, K, offeringAt , signShown, signOffsets, folkAt, WIND, DONOR, CRUMBLE, ROCK, SNAKE } from './world.js'
import { tr, roomName } from './i18n.js'
import { placedSigns } from './signs.js'
import { moveDonor, donorZone, floorSpanAt } from './donor.js'
import { makePorridge, stepPorridge, spillPorridge, BOWL } from './porridge.js'
import { createPlayer, stepPlayer, flyPlayer, hurtBox, enterAbove, rnd, HW } from './player.js'
import { REALMS, FIRST_REALM, ESCAPE, LISTEN_RANGE, LISTEN_WAIT, LISTEN_FILL, RAIN_TOTAL, RAIN_TIME, RAIN_RIPEN, FLOAT } from './realms.js'

// 運ぶ器の姿勢（底の真ん中は頭の上。傾きは盆の傾き S.tilt から。乳粥の粒 src/porridge.js が使う）
export const bowlPose = (p, tilt) => ({ x: p.x, y: p.y - 18, a: (tilt || 0) * BOWL.maxAngle })
// 人の道: こぼした乳粥が元の場所に戻るまで（秒）。こぼれた乳粥（1.6 秒）と落ちていく器が消えてから戻る（2026-11-08。前はすぐ戻っていて、こぼれた乳粥がまだ見えている間に、元の場所にもう盛ってあった）
export const GIFT_BACK = 2.5
const SPILL_FALL = 3 * TILE   // 人の道: これだけ落ちると、運んでいる食べ物がこぼれる（ドット。2026-11-08）
// 人の道の盆の傾き（2026-11-08）: walk 同じ向きに歩き続けたときの傾く速さ（1 秒に。1 でこぼれる。走る 138 で、まっすぐ約 7 マス）、settle 止まったときに戻る速さ、
//   back 逆向きに歩いたときに戻る速さ、jolt 歩き出し・着地（1 マス以上）でぐらっと足す傾き、shake これを越えると盆が震える。
//   向きだけを見る（スティックの倒し具合は見ない。キーボードと同じ）
export const TRAY = { walk: (1 - 0.15) * 138 / (7 * TILE), settle: 2.0, back: 3.0, jolt: 0.15, shake: 0.75 }   // walk: 歩き出しのぐらつき（jolt）を足して、止まった所からまっすぐ 7 マスでこぼれる（2026-11-08 に、前の 138 / (7 * TILE) では 5.5 マスだったので直した）
const FLY_SPEED = 150   // デバッグの「飛ぶ」の速さ（ドット/秒）

// 死んだ所の花の根もと { x, y, dir }（2026-11-05）: 天井・壁の針で死んだときは、その針の根もとの面から、針と同じ向きに咲く
//   dir: 'down'（天井から下へ）・'right'（左の壁から右へ）・'left'（右の壁から左へ）。ほかは足もとの地面から上へ（dir なし）
//   面に沿った位置は、針のタイルの中に収める（花を少しずつずらしても、針の列からはみ出しにくいように）
function flowerSpot(world, p, cause) {
  const hit = cause === 'spike' ? spikeAt(world, hurtBox(p)) : null
  const along = (v, t0) => Math.max(t0 + 4, Math.min(t0 + 12, v))
  if (hit?.k === K.spikeDown) return { x: along(p.x, hit.tx * TILE), y: hit.ty * TILE, dir: 'down' }
  if (hit?.k === K.spikeRight) return { x: hit.tx * TILE, y: along(p.y - 7, hit.ty * TILE), dir: 'right' }
  if (hit?.k === K.spikeLeft) return { x: (hit.tx + 1) * TILE, y: along(p.y - 7, hit.ty * TILE), dir: 'left' }
  return { x: p.x, y: groundBelow(world, p.x, p.y - 2) }
}

export const VIEW_W = 320, VIEW_H = 240
const SAVE_KEY = 'reincarnation-save-v5'   // v5（2026-11-08）: 見つけた光の部屋を、光の部屋の番号（地図の no）で覚える（光の部屋を動かしても崩れない）
export const OLD_SAVE_KEYS = ['reincarnation-save-v4', 'reincarnation-save-v3', 'reincarnation-save-v2']   // 前の記録。v5 にしたときに全部消した（読まない。見つけたら消す）
export const DEAD_TIME = 1.0       // 死んでから次の生まで（秒）
// 光の列が出る死: ボタンで先へ進めるようになるまで（秒）。押すまで待つ（ひとりでには進まない）
export const DEAD_SKIP = { light: 1.9, escape: 2.6 }
export const LIGHT_NEAR = 22, LIGHT_FAR = 170   // 光の部屋の地獄の者からの距離（ドット）: これより近いと見つける、これより遠いと暗いまま
export const DISCOVER_TIME = 0.8   // 光の部屋を見つけたときの光（秒）
export const DEATH_HOLD = 0.1      // 死んだ瞬間、白く光って止まる（秒）。そのあと花びらがはじける
export const ROOM_PAUSE = 0.32     // 部屋を移るとき、止まって新しい部屋を見せる（秒。カメラが移る間）
export const SIGN_OPEN = 0.12, SIGN_CLOSE = 0.22   // 看板の窓が開く・閉じる（秒）。開くのは速く、閉じるのは少しゆっくり

// maps: 道ごとの部屋の一覧（src/maps.js の MAPS）。rooms・world: 一つの地図だけで遊ぶとき（エディタ、道具）。realm: その道（はじめの道）
// storage: null なら記録しない。spawn: はじまりの代わりの位置。fixedSpawn: 何度死んでも spawn から（エディタの試し遊び）
// wander: 解脱したあとの「道をめぐる」（2026-11-07）。死んでも生の数を増やさず、咲いた花は記録に入れず、光の部屋を見つけても次の道へは移らない。看板・光の部屋は記録に入る
export function createGame({ maps, rooms, world: given, realm = FIRST_REALM, startRealm = null, storage = globalThis.localStorage, spawn, fixedSpawn = false, wander = false } = {}) {
  if (!maps) maps = { [realm]: rooms || [] }
  // 道ごとの記録: 見つけた光の部屋、開いたすり抜けの岩、咲いた花、次の生まれる所
  const records = {}
  const rec = (r) => (records[r] ??= { found: new Set(), revealed: new Set(), opened: new Set(), flowers: [], spawn: null, given: new Set(), rainBest: 0 })   // rainBest: 天で一度の花の雨に拾った数の、いちばん多い数
  let world = null
  const S = {
    world, realm, records, time: 0, lifeNo: 1, flowers: [], dead: null, player: null, room: null, cam: { x: 0, y: 0 },
    camFrom: null, camT: 1, pause: 0, signsRead: new Set(), signNear: null, reading: null, light: 0, listen: 0, nearT: 0, rotten: new Map(), banner: null, petals: [], found: new Set(), revealed: new Set(), opened: new Set(), places: new Set(), sfx: [], foundThisLife: 0, escaped: 0,
  }
  // 道に入る: その道の地図を組み立て、記録を当てる
  const enterRealm = (r) => {
    S.realm = r
    world = S.world = given || buildWorld(maps[r], { strict: false, realm: r })
    const d = rec(r)
    fromKeys(r, d)
    S.found = d.found; S.revealed = d.revealed; S.opened = d.opened; S.flowers = S.wander ? [...d.flowers] : d.flowers; S.given = d.given   // めぐる間の花は写しに（記録に入れない）
    for (const ri of d.found) openDoorsOf(world, ri)
    for (const gi of d.revealed) openHidden(world, gi)
    for (const di of d.opened) openDoor(world, di)
    // 再び人: 道の区切りごとに、その道で死んだ所の花（自分の過去の生）を並べる。一周の状態（触れたか、何周め）
    S.memories = []; S.loopRun = null
    const secs = REALMS[r]?.sections
    if (secs && world.loop) {
      const secLen = world.loop.len / secs.length
      secs.forEach((sr, i) => {
        const rooms = maps[sr] || [], fl = records[sr]?.flowers || []
        if (!rooms.length || !fl.length) return
        const minX = Math.min(...rooms.map((q) => q.x)) * TILE, maxX = Math.max(...rooms.map((q) => q.x + q.rows[0].length)) * TILE
        for (const f of fl) {
          const x = world.loop.x0 + secLen * i + 24 + ((f.x - minX) / Math.max(1, maxX - minX)) * (secLen - 48)
          const y = groundBelow(world, x, (world.rooms[world.loop.room].y + 3) * TILE)   // 天井より下から地面を探す
          S.memories.push({ x, y, life: f.life, t: 9, realm: sr })   // 継ぎ目の両側の写しには、描くときに一周ずらして重ねる
        }
      })
      // 周の状態（この周で触れたか、触れたもの、何周め、輪が切れたか）は記録に残す（読み直しても、触れた周は触れたまま）
      const lr = d.loopRun || {}
      // 道をめぐる間は、輪をはじめから（記録の輪は切れたままにして、めぐる間の輪は記録に入れない）
      if (S.wander) S.loopRun = { clean: true, laps: 0, taken: new Set(), freed: false }
      else S.loopRun = d.loopRun = { clean: lr.clean ?? true, laps: lr.laps || 0, taken: new Set(lr.taken || []), freed: !!lr.freed }
    }
    S.totalFlowers = Object.values(records).reduce((n, d) => n + d.flowers.length, 0)
    S.spawn = d.spawn || (spawn ? { ...spawn } : world.start ? { x: world.start.x, y: world.start.y } : { x: 0, y: 0 })
    // 地図を作り直して、記録の生まれる所が部屋の外や岩の中になったときは、その道のはじまりから
    const tx = Math.floor(S.spawn.x / TILE), ty = Math.floor((S.spawn.y - 1) / TILE)
    if (world.start && (!roomAt(world, S.spawn.x, S.spawn.y - 8) || isSolidKind(tileAt(world, tx, ty)))) S.spawn = { x: world.start.x, y: world.start.y }
  }

  // 記録の番号 ⇄ 記録に書く名前。光の部屋は光の部屋の番号（地図の no。2026-11-08）、すり抜けの岩はいちばん若いタイルの位置、施す食べ物はそのタイルの位置
  //   まだ入っていない道の記録は、読んだときの位置のまま（keys）持っておいて、入ったときに番号にする
  const built = {}
  const keyMaps = (r) => {
    const rooms = maps[r] || [], w = r === S.realm ? world : null
    const roomKey = (i) => rooms[i]?.light && rooms[i].no != null ? String(rooms[i].no) : null
    const ww = w || (rooms.length ? (built[r] ??= buildWorld(rooms, { strict: false, realm: r })) : null)
    const tileKey = (c) => `${c % ww.w},${Math.floor(c / ww.w)}`
    return {
      room: [roomKey, (k) => rooms.findIndex((q) => q.light && String(q.no) === String(k))],
      hidden: [(gi) => ww?.hiddenGroups[gi] ? tileKey(Math.min(...ww.hiddenGroups[gi])) : null, (k) => ww ? ww.hiddenGroups.findIndex((g) => g.some((c) => tileKey(c) === k)) : -1],
      door: [(di) => ww?.doorGroups[di] ? tileKey(Math.min(...ww.doorGroups[di].tiles)) : null, (k) => ww ? ww.doorGroups.findIndex((g) => g.tiles.some((c) => tileKey(c) === k)) : -1],
      gift: [(gi) => ww?.gifts[gi] ? `${ww.gifts[gi].tx},${ww.gifts[gi].ty}` : null, (k) => ww ? ww.gifts.findIndex((g) => `${g.tx},${g.ty}` === k) : -1],
    }
  }
  const keysOf = (r, d) => {
    if (d.keys) return d.keys
    const km = keyMaps(r)
    return { found: [...d.found].map(km.room[0]).filter(Boolean), revealed: [...d.revealed].map(km.hidden[0]).filter(Boolean), opened: [...d.opened].map(km.door[0]).filter(Boolean), given: [...d.given].map(km.gift[0]).filter(Boolean) }
  }
  const fromKeys = (r, d) => {
    if (!d.keys) return
    const km = keyMaps(r), k = d.keys
    d.keys = null
    for (const x of k.found || []) { const i = km.room[1](x); if (i >= 0) d.found.add(i) }
    for (const x of k.revealed || []) { const i = km.hidden[1](x); if (i >= 0) d.revealed.add(i) }
    for (const x of k.opened || []) { const i = km.door[1](x); if (i >= 0) d.opened.add(i) }
    for (const x of k.given || []) { const i = km.gift[1](x); if (i >= 0) d.given.add(i) }
  }
  const save = () => {
    if (!storage) return
    rec(S.realm).spawn = S.spawn
    const realms = {}
    for (const [r, d] of Object.entries(records)) realms[r] = { spawn: d.spawn, ...keysOf(r, d), rainBest: d.rainBest, ...(d.loopRun ? { loopRun: { ...d.loopRun, taken: [...d.loopRun.taken] } } : {}), flowers: d.flowers.map((f) => [Math.round(f.x), Math.round(f.y), f.life, f.kind ?? 0, ...(f.dir ? [f.dir] : [])]) }
    try { storage.setItem(SAVE_KEY, JSON.stringify({ lifeNo: S.lifeNo, realm: S.realm, places: [...S.places], escaped: S.escaped, liberated: S.liberated || false, signs: [...S.signsRead], realms })) } catch {}
  }
  const load = () => {
    try {
      for (const k of OLD_SAVE_KEYS) storage?.removeItem(k)   // 前の記録は読まずに消す（v5 で作り直した。2026-11-08）
      const d = JSON.parse(storage?.getItem(SAVE_KEY) || 'null')
      if (!d) return
      S.lifeNo = d.lifeNo || 1
      for (const pl of d.places || []) S.places.add(pl)
      for (const id of d.signs || []) S.signsRead.add(id)   // 読んだ看板（看板の番号。道をまたいで一つの記録）
      S.escaped = d.escaped || 0
      S.liberated = !!d.liberated
      for (const [r, v] of Object.entries(d.realms || {})) {
        const x = rec(r)
        x.keys = { found: v.found || [], revealed: v.revealed || [], opened: v.opened || [], given: v.given || [] }
        x.flowers.push(...(v.flowers || []).map(([fx, fy, life, kind, dir]) => ({ x: fx, y: fy, life, t: 9, ...(kind ? { kind } : {}), ...(dir ? { dir } : {}) })))
        x.rainBest = Math.min(v.rainBest || 0, RAIN_TOTAL)   // 前の天の作りの bliss（摘んだ合計）は読まない
        if (v.spawn) x.spawn = v.spawn
        if (v.loopRun) x.loopRun = v.loopRun
      }
      if (d.realm && maps[d.realm]) S.realm = d.realm
    } catch {}
  }

  const camTarget = () => {
    const r = S.room, p = S.player
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
    return {
      x: Math.round(clamp(p.x - VIEW_W / 2, r.x * TILE, (r.x + r.w) * TILE - VIEW_W)),
      y: Math.round(clamp(p.y - 8 - VIEW_H / 2, r.y * TILE, (r.y + r.h) * TILE - VIEW_H)),
    }
  }

  // 布施人を、結ばれた光の部屋の座る所のそばに、ひざまずいた姿で置く（もう満ちた光の部屋。生の始まり・デバッグの「全部」）
  const placeDonorAtLight = (b) => { const seat = world.rooms[b.d.target].seat; Object.assign(b, { st: 'offer', room: b.d.target, x: seat.x - 10, y: seat.y, vx: 0, vy: 0, dir: 1, kneel: -1e9, away: 0 }) }

  // 部屋の時計（2026-11-11。本人の頼み）: 生き物（鳥・魚・蛇）と転がる岩は、いる部屋に入った時から数える時計で動く。
  //   世界の時計のままだと、部屋に入った瞬間（生き直した瞬間も）に、たまたま入口のそばにいた蛇や岩にいきなり当たって理不尽だった。
  //   入るたびに同じ始まり方になる: 蛇はプレイヤーから遠い方の端から、岩は予兆の砂ぼこり（ROCK.warn 秒）のあとに初めて出る。
  //   カメラが移る間（ROOM_PAUSE）は止まったまま。ほかの部屋（移る間に見えている隣の部屋）は世界の時計のまま。噴き出す炎は世界の時計のまま
  S.roomClock = { ri: -1, t0: 0, off: new Map() }
  const startRoomClock = (room, delay = 0) => {
    const C = S.roomClock = { ri: room ? room.index : -1, t0: S.time + delay, off: new Map() }
    if (!room) return
    const px = S.player?.x ?? 0
    for (const c of world.creatures || []) {
      if (c.ri !== C.ri || c.kind !== 'snake') continue
      // 蛇: 時計 0 で、プレイヤーから遠い方の端にいるように（creatureAt の d が 0 なら左の端、len なら右の端）
      const len = Math.max(1, c.x1 - c.x0), want = Math.abs(px - c.x0) > Math.abs(px - c.x1) ? 0 : len
      C.off.set(c, ((((want - c.phase * len * 2) % (len * 2)) + len * 2) % (len * 2)) / SNAKE.speed)
    }
    for (const q of world.rockers || []) if (q.ri === C.ri) S.rockK?.delete(q.index)   // 時計が変わっても、その瞬間に岩を出さない
    if (S.rocks) S.rocks = S.rocks.filter((r) => r.q.ri !== C.ri)   // 前に入ったときの岩は残さない
  }
  const roomLocal = (ri) => (ri === S.roomClock.ri ? Math.max(0, S.time - S.roomClock.t0) : null)
  S.creatureTime = (c) => { const lt = roomLocal(c.ri); return lt == null ? S.time : lt + (S.roomClock.off.get(c) || 0) }
  // 岩の時計: 部屋の時計 0 で、次に出るまでちょうど ROCK.warn 秒（予兆の砂ぼこりが始まる所）
  const rockTime = (q) => { const lt = roomLocal(q.ri); return lt == null ? S.time : lt + ((((1 - ROCK.warn / ROCK.period - q.phase) % 1) + 1) % 1) * ROCK.period }
  // 次の生は、死んだ部屋の入口から（入口: その部屋に入って最初に足をついた所）
  let pendingSpawn = false
  const beginLife = () => {
    S.player = createPlayer(S.spawn.x, S.spawn.y)
    pendingSpawn = false
    S.room = roomAt(world, S.player.x, S.player.y - 8)
    startRoomClock(S.room)
    S.cam = camTarget(); S.camMin = null
    S.camT = 1
    S.dead = null
    S.foundThisLife = 0
    S.light = S.room?.light && S.found.has(S.room.index) ? 1 : 0
    S.listen = 0
    S.winds = (world.winds || []).map((w) => ({ w, st: 'idle', t: 0, x: w.x, y: w.y, vx: 0, vy: 0, heat: 0, trail: [], embers: [], seed: w.index * 7919 + 1 }))   // 餓鬼の道: 熱い風（次の生では、どれも生まれる前に戻る）
    S.folkClock = REALMS[S.realm]?.folkLook ? (world.folk || []).map(() => S.time) : null; S.folkLook = S.folkClock ? S.folkClock.map(() => 0) : null   // 人の道: 町の人ごとの時計と、こちらを見ている残り時間（stepFolk）
    S.folkSeed = Math.floor(Math.random() * 1e9)   // 餓鬼の道: 町の人の顔ぶれは、生ごとに変わる（src/render/things.js の drawFolk）
    // 餓鬼の道: 布施人。次の生では家でうろうろに戻る。ただし結ばれた光の部屋（target）がもう満ちていれば、その部屋の座る所のそばで、
    //   はじめからひざまずいている（供えた食べ物も置いたまま。回向の言葉は出さない）
    S.donors = (world.donors || []).map((d) => {
      const b = { d, st: 'wander', t: 0, x: d.x, y: d.y, vx: 0, vy: 0, dir: 1, onGround: true, room: -1, x0: d.x0, x1: d.x1 }
      if (d.target >= 0 && S.found.has(d.target) && world.rooms[d.target]?.seat) placeDonorAtLight(b)
      return b
    })
    // 人の道: 崩れた岩は元に戻す（2026-11-10）。転がる岩は無い所から（2026-11-08）
    for (const i of world.crumbles || []) world.t[i] = K.crumble
    S.crumbleT = new Map(); S.crumbleFx = []; S.crumbleGone = new Map(); S.crumbleIn = new Map(); S.rocks = []; S.rockDust = []; S.rockK = new Map()
    S.rotten = new Map()   // 餓鬼の道: この生で触って腐らせた食べ物（次の生では、また並んでいる）
    S.carry = null         // 人の道: 運んでいる施す食べ物（死ぬと元の場所に戻る）
    S.carryTop = null; S.porridge = null; S.fallBowl = null; S.giftGone = new Map()   // 人の道: 運んでいる間の、いちばん高かった所（落ちた高さを測る）、乳粥の粒、落ちていく器、こぼして元の場所に戻るのを待つ乳粥
    S.safe = { x: S.player.x, y: S.player.y }   // 天の道: 落ちたときに戻る足場
    S.rain = REALMS[S.realm]?.light === 'rain' ? { t: 0, dropped: 0, caught: 0, items: [], sparks: [], end: 0 } : null   // 天の道: 天女がまく花
    S.bliss = 0; S.blissBest = rec(S.realm).rainBest || 0
    S.banner = { text: tr.life(S.lifeNo), t: 0, big: true }
  }

  // 天の道で落ちたとき: 死なずに、落ちる前に立っていた足場に戻る。そこに天の花（曼陀羅華）が咲く
  const fallBack = () => {
    const p = S.player
    S.flowers.push({ x: S.safe.x, y: groundBelow(world, S.safe.x, S.safe.y - 2), life: S.lifeNo, t: 0, kind: 'mandarava' })
    Object.assign(p, { x: S.safe.x, y: S.safe.y, vx: 0, vy: 0, dash: 0, climb: null })
    S.bloom = { x: p.x, y: p.y - 7, t: 0, seed: S.flowers.length * 13, deva: true }
    save()
  }

  S.die = (cause) => {
    if (REALMS[S.realm]?.sky && cause !== 'mindlost') { fallBack(); return }
    const p = S.player
    // 死の間際: この生で光の部屋を見つけていれば、それが浮かぶ。見つけた数がそろっていれば、この道を抜けて、次の生は次の道
    // 天の道: 花が降り終わると、念を失って天の身から落ちる（拾った数にかかわらず、次の道へ。長部 1）
    const mindlost = cause === 'mindlost'
    const escape = (mindlost || S.found.size >= ESCAPE) && !fixedSpawn && !S.wander   // 道をめぐる間は、次の道へ移らない
    const next = REALMS[S.realm]?.next
    S.dead = { t: 0, x: p.x, y: p.y - 7, cause, light: S.foundThisLife > 0, escape, mindlost, next: escape && maps[next] ? next : null }
    // 畜生の水に落ちた: 水の中に潜む大きな魚が、下から食べる（2026-11-06。カエルが溺れるのは不思議なので。src/render/effects.js の drawJaws）
    if (S.realm === 'animal' && cause === 'fire') {
      let ty = Math.floor((p.y - 8) / TILE)
      while (ty < world.h && tileAt(world, Math.floor(p.x / TILE), ty) !== K.fire) ty++
      S.dead.eaten = { x: p.x, surface: ty * TILE + 6, dir: p.dir || 1 }
    }
    if (!mindlost) S.sfx.push('death')   // 効果音: 死ぬ（どの死に方でも同じ。天で念を失うときは鳴らさない）
    if (mindlost) { save(); return }   // 天人の死: 体は光になって消える（花は咲かない）
    if (escape) S.escaped++
    // 花は、はじけたあとに育ち始める（t が負の間は描かない）
    S.flowers.push({ ...flowerSpot(world, p, cause), life: S.lifeNo, t: -DEATH_HOLD - 0.08 })
    // 花びら: 大きさ・速さ・寿命ばらばらに、上寄りにはじけて、ひらひら返りながら、ゆっくり舞い落ちる（描くのは render.js）
    const seed = S.lifeNo * 97 + S.flowers.length
    for (let i = 0; i < 22; i++) {
      const a = -Math.PI / 2 + (rnd(seed, i) - 0.5) * Math.PI * 1.6, sp = 80 + rnd(seed, i + 30) * 110
      S.petals.push({ x: p.x, y: p.y - 7, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: -DEATH_HOLD, life: 1.2 + rnd(seed, i + 60) * 1.2, big: rnd(seed, i + 90) < 0.6, ph: rnd(seed, i + 120) * 6.28, seed: seed + i })
    }
    S.bloom = { x: p.x, y: p.y - 7, t: -DEATH_HOLD, seed }
    save()
  }

  // すり抜けの岩が開く（描くのは render.js）: 画面が小さく揺れ、岩のかけらが転がり落ちて跳ね、土ぼこりが膨らみながら薄れる
  // 崩れる（すり抜けの岩 gi。扉は cells と seed を渡す）
  const crumble = (gi, cells = world.hiddenGroups[gi], seed = gi * 53 + 7) => {
    const tiles = cells.map((c) => [c % world.w, Math.floor(c / world.w)])
    const chunks = [], dust = []
    tiles.forEach(([tx, ty], n) => {
      for (let i = 0; i < 4; i++) {
        const s = n * 10 + i
        chunks.push({ x: tx * TILE + 3 + rnd(seed, s) * 10, y: ty * TILE + 3 + rnd(seed, s + 100) * 10, vx: (rnd(seed, s + 200) - 0.5) * 70, vy: -20 - rnd(seed, s + 300) * 50, big: rnd(seed, s + 400) < 0.5, bounced: 0, rest: false, life: 1.0 + rnd(seed, s + 500) * 0.6 })
      }
      for (let i = 0; i < 2; i++) { const s = n * 10 + i; dust.push({ x: tx * TILE + 4 + rnd(seed, s + 600) * 8, y: ty * TILE + 6 + rnd(seed, s + 700) * 8, vx: (rnd(seed, s + 800) - 0.5) * 16, vy: -6 - rnd(seed, s + 900) * 8, r0: 2 + rnd(seed, s + 1000) * 2, life: 0.7 + rnd(seed, s + 1100) * 0.5, delay: rnd(seed, s + 1200) * 0.12 }) }
    })
    return { gi, tiles, t: 0, seed, chunks, dust }
  }
  const stepCrumble = (c, dt) => {
    c.t += dt
    for (const k of c.chunks) {
      if (k.rest) continue
      k.vy += 520 * dt
      const nx = k.x + k.vx * dt, ny = k.y + k.vy * dt
      if (isSolidKind(tileAt(world, Math.floor(nx / TILE), Math.floor(ny / TILE)))) {
        if (k.vy > 0 && k.bounced < 1) { k.vy *= -0.35; k.vx *= 0.5; k.bounced++ } else { k.rest = true }   // 一度跳ねて、止まる
        continue
      }
      k.x = nx; k.y = ny
    }
    for (const d of c.dust) { if (c.t < d.delay) continue; const e = Math.exp(-2 * dt); d.vx *= e; d.vy *= e; d.x += d.vx * dt; d.y += d.vy * dt }
    if (c.t > 1.7) S.reveal = null
  }

  // 天女の花の雨: 天女は上空を舞いながら、RAIN_TIME 秒かけて RAIN_TOTAL 輪の花をまく。花はひらひら落ち、拾われなければ地面の下へ消える。
  //   最後の一輪が消えると、念を失って天の身から落ちる。拾った数のいちばん多い記録を残す
  const apsara = (t) => ({ x: (S.room.x + S.room.w / 2) * TILE + Math.sin(t * 0.55) * (S.room.w * TILE / 2 - 40), y: S.room.y * TILE + 40 + Math.sin(t * 1.4) * 10, dir: Math.cos(t * 0.55) >= 0 ? 1 : -1 })
  S.apsara = apsara
  const stepRain = (dt) => {
    const R = S.rain
    R.t += dt
    // まき方: 後になるほど、間が詰まり（k 輪目は RAIN_TIME × (k / RAIN_TOTAL)^0.6 秒に）、まとめて散らすことも多く、数も多くなる（だんだん難しく）
    //   一輪ずつのときと、3〜5（終わりぎわは 6）輪をまとめて左右に広く散らすときがある
    while (R.dropped < RAIN_TOTAL && R.t >= RAIN_TIME * ((R.dropped + 1) / RAIN_TOTAL) ** 0.6) {
      const a = apsara(R.t), s0 = R.dropped * 7 + S.lifeNo * 131, late = R.dropped / RAIN_TOTAL
      // 2026-11-10: 少しだけ難しく（本人の頼み。少し頑張ればパーフェクトが取れたので）。後半ほど、まとめて散らすことが増え（0.35 → 0.45）、広く散り（最後は 1.3 倍）、速く落ちる（最後は +10）
      const burst = rnd(s0, 9) < 0.15 + late * 0.45 ? 3 + Math.floor(rnd(s0, 10) * (3 + late * 1.5)) : 1
      for (let k = 0; k < burst && R.dropped < RAIN_TOTAL; k++) {
        // 横一線に並ばないように: 散らし方・出る高さ・はじめの上向きの勢い・落ちる速さ・揺れ方を一輪ずつばらばらに
        const s = s0 + k * 17, spread = burst > 1 ? (k - (burst - 1) / 2) * 34 * (1 + late * 0.3) * (0.6 + rnd(s, 6) * 0.8) : (rnd(s, 1) - 0.5) * 40
        R.items.push({ x: a.x + (rnd(s, 7) - 0.5) * 10, y: a.y + 6 + (rnd(s, 8) - 0.5) * 16, vx: spread + (rnd(s, 4) - 0.5) * 24, vy: -40 * rnd(s, 5), t: 0, color: Math.floor(rnd(s, 2) * 5), ph: rnd(s, 3) * 6.28, fall: 26 + late * 10 + rnd(s, 11) * 18, sway: 6 + rnd(s, 12) * 12 })
        R.dropped++
      }
    }
    const p = S.player, b = hurtBox(p), ground = (S.room.y + S.room.h - 2) * TILE
    for (const f of R.items) {
      f.t += dt; f.vx *= Math.exp(-0.9 * dt); f.vy = Math.min(f.fall ?? 36, f.vy + 40 * dt)
      f.x += (f.vx + Math.sin(f.t * 2.5 + f.ph) * (f.sway ?? 12)) * dt; f.y += f.vy * dt
      // 壁ぎわでは跳ね返る（どの花も、手の届く所に落ちる。全部拾うことも、できなくはない）
      const wl = (S.room.x + 1) * TILE + 9, wr = (S.room.x + S.room.w - 1) * TILE - 9
      if (f.x < wl) { f.x = wl; f.vx = Math.abs(f.vx) } else if (f.x > wr) { f.x = wr; f.vx = -Math.abs(f.vx) }
      if (!S.dead && f.t >= RAIN_RIPEN && b.l < f.x + 10 && b.r > f.x - 10 && b.b > f.y - 10 && b.t < f.y + 10) { f.caught = true; R.caught++; R.sparks.push({ x: f.x, y: f.y, t: 0, color: f.color, seed: R.caught }) }   // 拾える範囲は、花のまわり 10 ドット（体の四角と重なれば）
      if (f.y > ground + 10) f.gone = true
    }
    R.items = R.items.filter((f) => !f.caught && !f.gone)
    for (const k of R.sparks) k.t += dt
    R.sparks = R.sparks.filter((k) => k.t < 0.6)
    S.bliss = R.caught; S.blissBest = rec(S.realm).rainBest || 0
    if (R.dropped >= RAIN_TOTAL && !R.items.length && !S.dead) {
      R.end += dt
      if (R.end > 0.8) { const d = rec(S.realm); d.rainBest = Math.max(d.rainBest || 0, R.caught); S.banner = null; S.die('mindlost') }
    }
  }

  // 再び人: 一本道で、後ろへは戻れない（カメラは前へしか進まず、画面の左の端と道の始まりが壁。REALMS の oneWay）。
  //   誘うものに触れると味わえる（その周は、輪が切れない）。継ぎ目まで来ると、触れた周なら気づかないうちに最初へ戻り（無限ループ）、
  //   一度も触れずに来た周なら、輪が切れて道がその先へ続く。終わりの部屋に入ると解脱。立ち直す所は、各画面の左端の床（死んでも周の数え直しは無い）
  const stepLoop = (p, dt) => {
    const L = S.loopRun, lp = world.loop
    for (const s of S.savors || []) s.t += dt
    if (L.freed && L.freedT != null) L.freedT += dt   // 輪が切れてからの時間（誘うものが消えていく。描くのは render.js）
    S.savors = (S.savors || []).filter((s) => s.t < 1.4)
    const b = hurtBox(p)
    for (const tm of world.tempts) {
      if (L.freed || L.taken.has(tm.index)) continue   // 輪が切れたあとは、もう誘われない
      const offs = [0, ...(tm.x >= lp.x0 && tm.x < lp.x0 + 20 * TILE ? [lp.len] : []), ...(tm.x >= lp.x0 + lp.len - 20 * TILE && tm.x < lp.x0 + lp.len ? [-lp.len] : [])]
      const near = offs.some((o) => b.l < tm.x + o + 6 && b.r > tm.x + o - 6)   // 継ぎ目の両側の写しの上でも
      if (near && b.b > tm.y - 12 && b.t < tm.y) {
        L.taken.add(tm.index); L.clean = false
        S.savors.push({ x: tm.x, y: tm.y - 10, t: 0, kind: tm.kind, text: tr.savor[tm.kind] })
      }
    }
    const r0 = world.rooms[lp.room]
    if (p.onGround && !p.climb && S.room?.index === lp.room) { const col = Math.floor((p.x - lp.x0) / TILE); if (((col % 20) + 20) % 20 >= 1 && ((col % 20) + 20) % 20 <= 2) S.spawn = { x: Math.round(p.x), y: Math.round(p.y) } }
    if (!L.freed && p.x >= lp.x0 + lp.len) {
      if (L.clean) { L.freed = true; L.freedT = 0; S.banner = { text: tr.freed, t: 0, light: true } }
      else {
        // 気づかないうちに、最初へ（体・カメラ・立ち直す所・跡を一緒にずらす）
        const d = -lp.len
        p.x += d; S.cam.x += d; if (S.camFrom) S.camFrom.x += d
        if (S.spawn.x >= lp.x0 + lp.len) S.spawn.x += d
        for (const s of S.savors || []) s.x += d
        S.camMin = S.cam.x
        L.taken.clear(); L.clean = true; L.laps++
      }
    }
    if (L.freed && S.room?.end && (!S.liberated || S.wander)) { S.liberated = true; S.wander = false; S.ending = { t: 0 }; S.totalFlowers = Object.values(records).reduce((n, d) => n + d.flowers.length, 0); save() }
  }

  // 看板の窓を閉じる（キャンセル）。開けるのは、開いてから少し経ってから（開いた上キーの押しっぱなしなどで閉じないように）
  S.closeReading = () => { if (S.reading && S.reading.close == null && S.reading.t > 0.2) S.reading.close = 0 }
  S.canDecide = () => !!(S.reading && S.reading.close == null && S.reading.t > 0.2)
  // 見つけた数（まだ入っていない道は、読んだ記録の数）
  S.foundCount = (r) => { const d = records[r]; return !d ? 0 : d.keys ? (d.keys.found || []).length : d.found.size }
  // デバッグ（2026-11-07）: 看板を全部読んだことにし、どの道の光の部屋も全部見つけたことにする（記録に書く）。今の道の扉も開く
  S.debugComplete = () => {
    for (const r of Object.keys(maps)) {
      const d = rec(r)
      fromKeys(r, d)
      ;(maps[r] || []).forEach((room, i) => { if (room.light) d.found.add(i) })
      for (const id of placedSigns(maps[r] || [])) S.signsRead.add(id)
    }
    for (const ri of S.found) openDoorsOf(world, ri)
    // 今の生の布施人も、その場で結ばれた光の部屋へ
    for (const b of S.donors || []) if (b.d.target >= 0 && world.rooms[b.d.target]?.seat) placeDonorAtLight(b)
    save()
  }
  // デバッグ（2026-11-08）: 最後の道で、渇愛が尽きた状態にして、継ぎ目の 3 マス手前に立つ（記録にも書く）。最後の道でなければ何もしない（false）
  S.debugFreeLoop = () => {
    const L = S.loopRun, lp = world.loop
    if (!L || !lp) return false
    L.freed = true; L.clean = true; L.taken.clear(); L.freedT = 0
    const tx = Math.floor((lp.x0 + lp.len) / TILE) - 3, r0 = world.rooms[lp.room]
    let ty = r0.y; while (ty < r0.y + r0.h - 1 && !(tileAt(world, tx, ty) === K.air && isSolidKind(tileAt(world, tx, ty + 1)))) ty++
    S.warp(tx * TILE + TILE / 2, (ty + 1) * TILE)
    S.banner = { text: tr.freed, t: 0, light: true }
    save()
    return true
  }
  S.reset = () => { if (storage) { storage.removeItem(SAVE_KEY); for (const k of OLD_SAVE_KEYS) storage.removeItem(k); location.reload() } }

  // 人の道の町の人（2026-11-08）: 近くに来ると立ち止まってこちらを見る（FOLK_LOOK）。離れて少しすると、止まった所から歩き出す。
  //   町の人ごとに時計（S.folkClock）を持ち、見ている間は進めない（前は時間だけで歩き、向きだけこちらに変えていたので、後ずさりして見えた）
  const FOLK_LOOK = { x: 56, y: 24, hold: 0.6 }
  const stepFolk = (p, dt) => {
    for (const f of world.folk) {
      const i = f.index, s = folkAt(f, S.folkClock[i])
      if (!S.dead && Math.abs(p.x - s.x) < FOLK_LOOK.x && Math.abs(p.y - s.y) < FOLK_LOOK.y) S.folkLook[i] = FOLK_LOOK.hold
      else S.folkLook[i] = Math.max(0, S.folkLook[i] - dt)
      if (S.folkLook[i] <= 0) S.folkClock[i] += dt
    }
  }

  // 人の道の崩れる岩（world.js の CRUMBLE。2026-11-10）: プレイヤーが乗るか角にしがみつくと崩れはじめ、hold 秒で崩れて空になる（一度崩れはじめたら、離れても最後まで崩れる）。
  //   崩れたら破片が落ちる（S.crumbleFx。描くのは src/render/tiles.js）。しばらくすると元に戻る（CRUMBLE.back）。次の生でも元に戻る（beginLife）
  const stepCrumbles = (p, dt) => {
    const on = new Set()
    if (p.onGround && !p.climb) {
      const ty = Math.floor((p.y + 0.5) / TILE)
      for (const x of [p.x - HW + 1, p.x + HW - 1]) { const tx = Math.floor(x / TILE); if (tileAt(world, tx, ty) === K.crumble) on.add(ty * world.w + tx) }
    }
    // 角にしがみついている間も、つかんでいる岩が崩れる岩なら数える（2026-11-10）。崩れたら手が離れて落ちる
    let grip = -1
    if (p.climb) {
      const c = p.climb, tx = Math.floor((c.wallX + (p.dir > 0 ? 1 : -1)) / TILE), ty = Math.floor(c.toY / TILE)
      if (tileAt(world, tx, ty) === K.crumble) { grip = ty * world.w + tx; on.add(grip) }
    }
    // 一度乗ったら（しがみついたら）、離れても止まらず、最後まで崩れる（2026-11-10）
    for (const i of on) if (!S.crumbleT.has(i)) S.crumbleT.set(i, 0)
    for (const i of [...S.crumbleT.keys()]) {
      const t = S.crumbleT.get(i) + dt
      if (t < CRUMBLE.hold) { S.crumbleT.set(i, t); continue }
      S.crumbleT.delete(i); world.t[i] = K.air
      S.crumbleGone.set(i, S.time)   // 崩れた時（back 秒たつと戻る）
      if (i === grip) { p.climb = null; p.vy = 30; p.vx = 0; p.onGround = false; p.regrab = 0.35 }   // つかんでいた岩が崩れた: 落ちる（すぐにはつかみ直さない）
      S.crumbleFx.push({ x: (i % world.w) * TILE, y: Math.floor(i / world.w) * TILE, t: 0, seed: i })
      S.sfx.push('crumble')
    }
    for (const f of S.crumbleFx) f.t += dt
    S.crumbleFx = S.crumbleFx.filter((f) => f.t < 1)
    // 崩れて back 秒たったら戻す。体がそのマスに重なっている間は待つ（閉じ込めない）。戻ったあと appear 秒は、ぽつぽつ現れる（S.crumbleIn。描くのは src/render/tiles.js）
    const b = hurtBox(p)
    for (const [i, t0] of S.crumbleGone) {
      if (S.time - t0 < CRUMBLE.back) continue
      const x = (i % world.w) * TILE, y = Math.floor(i / world.w) * TILE
      if (b.l < x + TILE + 2 && b.r > x - 2 && b.t < y + TILE && b.b > y - 2) continue
      world.t[i] = K.crumble; S.crumbleGone.delete(i); S.crumbleIn.set(i, 0)
    }
    for (const [i, t] of S.crumbleIn) { if (t + dt >= CRUMBLE.appear) S.crumbleIn.delete(i); else S.crumbleIn.set(i, t + dt) }
  }

  // 人の道の転がる岩（world.js の ROCK。2026-11-08）: 出る所（R）から period 秒ごとに出て、床を転がる。床が終われば落ちる。
  //   壁に当たると砕け（break）、川に落ちると沈む（sink）。当たると死ぬ（死んだら true）。乗れない
  const rockSolid = (x, y) => isSolidKind(tileAt(world, Math.floor(x / TILE), Math.floor(y / TILE)))
  const rockFloor = (x, y) => Math.floor(y / TILE) * TILE
  // 落ちて着いたときの土ぼこり（2026-11-10）: 左右へ勢いよく広がり、少し昇って消える。落ちた高さ（ドット）が大きいほど、多く、速く、長く
  const rockDustLand = (x, y, fall) => {
    const k = Math.min(1.6, fall / 48), n = Math.round(6 + 8 * k)
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1
      S.rockDust.push({ x: x + side * (3 + Math.random() * 4), y: y - 1 - Math.random() * 3, vx: side * (30 + Math.random() * 50) * (0.6 + k * 0.4), vy: -(2 + Math.random() * 12) * (0.6 + k * 0.4), t: 0, life: 0.5 + Math.random() * 0.4 + k * 0.15, big: true })   // 地面に沿って横へ広がる
    }
  }
  // 岩が出る瞬間の砂ぼこり: 岩のまわりから外へぱっと舞い、少し昇って消える（白く立ってから砂色へ）
  const rockDustBurst = (x, y) => {
    for (let i = 0; i < 16; i++) {
      // 向きも速さも出どころもばらばらに（そろえると輪に見えた）。半分は地面に沿って横へ、半分はもくもく上へ
      const low = i % 2 === 0, side = Math.random() < 0.5 ? -1 : 1
      const vx = side * (low ? 25 + Math.random() * 40 : Math.random() * 25), vy = low ? -(1 + Math.random() * 6) : -(12 + Math.random() * 25)
      S.rockDust.push({ x: x + (Math.random() - 0.5) * 14, y: y - 1 - Math.random() * (low ? 3 : 12), vx, vy, t: 0, life: 0.45 + Math.random() * 0.45, big: Math.random() < 0.75 })
    }
  }
  const stepRocks = (p, dt) => {
    for (const q of world.rockers) {
      const rt = rockTime(q), k = Math.floor(rt / ROCK.period + q.phase)
      if (S.rockK.has(q.index) && S.rockK.get(q.index) !== k) {
        S.rocks.push({ q, x: q.x, y: q.y, vx: q.dir * ROCK.speed, vy: 0, dir: q.dir, a: 0, onGround: false, st: 'roll', t: 0, fall: 0, seed: k * 31 + q.index })
        rockDustBurst(q.x, q.y)   // 出る瞬間: 砂ぼこりがぱっと舞い、その中から岩が現れる
      }
      S.rockK.set(q.index, k)
      // 出る前（warn 秒）: 出る所の足もとから、砂ぼこりが細く立ちはじめ、出る時が近づくほど増える（2026-11-10。前は上から小石が落ちていた）
      const left = (1 - ((rt / ROCK.period + q.phase) % 1)) * ROCK.period
      if (left < ROCK.warn && Math.random() < dt * (3 + 22 * (1 - left / ROCK.warn))) {
        const side = Math.random() < 0.5 ? -1 : 1
        S.rockDust.push({ x: q.x + side * Math.random() * 8, y: q.y - 1, vx: side * (2 + Math.random() * 8), vy: -(5 + Math.random() * 12), t: 0, life: 0.4 + Math.random() * 0.3, big: left < 0.35 && Math.random() < 0.5 })   // 出る直前は、粒が大きくなる
      }
    }
    const R = ROCK.r
    for (const r of S.rocks) {
      r.t += dt
      if (r.st !== 'roll') continue
      // 横: 前が壁なら砕ける
      const nx = r.x + r.vx * dt
      if (rockSolid(nx + r.dir * R, r.y - 4) || rockSolid(nx + r.dir * R, r.y - 12)) { r.st = 'break'; r.t = 0; r.x = Math.floor((nx + r.dir * R) / TILE) * TILE + (r.dir > 0 ? -R : TILE + R); if (S.room && roomAt(world, r.x, r.y - 8) === S.room) S.sfx.push('crumble'); continue }
      r.x = nx; r.a += (r.vx / R) * dt
      if (roomAt(world, r.x, r.y - R) !== world.rooms[r.q.ri]) { r.st = 'break'; r.t = 0; continue }   // 出た部屋の外へは行かない（端で砕ける。見ていない所から岩が来ないように）
      // 縦: 落ちる・床に乗る
      r.vy = Math.min(ROCK.maxFall, r.vy + ROCK.gravity * dt)
      const ny = r.y + r.vy * dt
      if (r.vy >= 0 && (rockSolid(r.x - R + 2, ny) || rockSolid(r.x + R - 2, ny))) {
        const top = Math.min(rockSolid(r.x - R + 2, ny) ? rockFloor(r.x - R + 2, ny) : Infinity, rockSolid(r.x + R - 2, ny) ? rockFloor(r.x + R - 2, ny) : Infinity)
        if (!r.onGround && r.fall > 4) rockDustLand(r.x, top, r.fall)   // どすん: 落ちた高さに合わせた大きな土ぼこり
        r.y = top; r.vy = 0; r.onGround = true; r.fall = 0
      } else { if (r.vy > 0) r.fall += ny - r.y; r.y = ny; r.onGround = false }
      // 転がっている間: 後ろに小さな土ぼこりを、ときどき
      if (r.onGround && (r.dustT = (r.dustT ?? 0) - dt) <= 0) { r.dustT = 0.08 + Math.random() * 0.06; S.rockDust.push({ x: r.x - r.dir * (5 + Math.random() * 2), y: r.y - 1, vx: -r.dir * (6 + Math.random() * 10), vy: -(3 + Math.random() * 6), t: 0, life: 0.3 + Math.random() * 0.2, big: false }) }
      // 川に落ちた: 沈む
      if (tileAt(world, Math.floor(r.x / TILE), Math.floor((r.y - 4) / TILE)) === K.fire) { r.st = 'sink'; r.t = 0; r.sy = Math.floor((r.y - 4) / TILE) * TILE + 6 }
      if (r.y > world.h * TILE + 32) r.st = 'gone'
      // 当たると死ぬ（体の四角と、岩の丸より少し小さい四角）
      if (!S.dead && !S.fly) { const b = hurtBox(p); if (b.l < r.x + R - 2 && b.r > r.x - R + 2 && b.t < r.y - 2 && b.b > r.y - 2 * R + 2) { S.die('rock'); return true } }
    }
    S.rocks = S.rocks.filter((r) => r.st === 'roll' || (r.st === 'break' && r.t < 1.0) || (r.st === 'sink' && r.t < 1.0))
    for (const d of S.rockDust) { d.t += dt; d.vx *= Math.exp(-4 * dt); d.vy = d.vy * Math.exp(-3 * dt) - 5 * dt; d.x += d.vx * dt; d.y += d.vy * dt }   // ふわっと広がって、ゆっくり昇る
    S.rockDust = S.rockDust.filter((d) => d.t < d.life)
    return false
  }

  // 餓鬼の道の熱い風（world.js の WIND。絵は src/render/wind.js）:
  //   idle つむじ風が待つ → gather ため → blow 生まれて追う（life 秒） → fade 燃え尽きて散る / crash 壁（岩・すり抜けの岩・扉）に当たって広がる → gone（その生では二度と出ない）。
  //   追い方: 餓鬼へ向かう最高速の速さとの差を、accel を上限に足す（慣性があり、急に向きを変えると行き過ぎる）。
  //   heat: 生まれたときがいちばん熱く、最後の cool 秒で冷めはじめる。火の粉（embers）は昇りながら冷える。当たると死ぬ（死んだら true）
  const windWall = (x, y) => { const k = tileAt(world, Math.floor(x / TILE), Math.floor(y / TILE)); return isSolidKind(k) || k === K.hidden }
  const stepWinds = (p, dt) => {
    const px = p.x, py = p.y - 8
    for (const b of S.winds) {
      const r = () => (b.seed = (b.seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff   // 乱数（風ごとの種から）
      const ember = (x, y, vx, vy, life, big = false) => b.embers.push({ x, y, vx, vy, t: 0, life, big })
      b.t += dt
      // 画面（部屋）をまたいでいるときは生まれない（2026-11-11。本人の頼み。隣の部屋の入口のそばで、見えない所の風が生まれて、いきなり当たることがあった）。
      //   生まれるのは、プレイヤーが風と同じ部屋にいるときだけ。集まっている間に部屋を出たら、生まれずに元へ戻る。追っている間に部屋を出たら、ほどけて消える（当たりは無くなる）
      const here = S.room?.index === b.w.ri
      if (b.st === 'idle') { if (here && Math.hypot(px - b.w.x, py - b.w.y) < WIND.wake) { b.st = 'gather'; b.t = 0 } }
      else if (b.st === 'gather' && !here) { b.st = 'idle'; b.t = 0 }
      else if (b.st === 'gather') {
        if (b.t >= WIND.gather) {
          Object.assign(b, { st: 'blow', t: 0, x: b.w.x, y: b.w.y, vx: 0, vy: 0, heat: 1, trail: [] })
          for (let i = 0; i < 10; i++) { const a = r() * Math.PI * 2, v = 40 + r() * 50; ember(b.x, b.y, Math.cos(a) * v, Math.sin(a) * v, 0.4 + r() * 0.4) }   // 放つ: 火の粉がはじける
        }
      } else if (b.st === 'blow' || b.st === 'fade') {
        if (b.st === 'blow' && !here) { b.st = 'fade'; b.t = 0 }
        const dx = px - b.x, dy = py - b.y, d = Math.hypot(dx, dy) || 1
        // 消える間（fade）も、同じ形で追い続ける（少しずつ遅くなる。止めると跡が縮んで、筋が短い線に分かれて見えた。2026-11-07）。当たりは無い
        const fk = b.st === 'fade' ? Math.min(1, b.t / WIND.fade) : 0, want = WIND.speed * (1 - fk * 0.4)
        let ax = (dx / d) * want - b.vx, ay = (dy / d) * want - b.vy
        const a = Math.hypot(ax, ay), lim = WIND.accel * dt
        if (a > lim) { ax *= lim / a; ay *= lim / a }
        b.vx += ax; b.vy += ay
        // 熱さ: 最後の cool 秒で 1 → 0.4（白い所が縮み、橙・赤へ）。消える間に 0.4 → 0
        b.heat = b.st === 'blow' ? 0.4 + 0.6 * Math.min(1, (WIND.life - b.t) / WIND.cool) : 0.4 * (1 - fk)
        const ox = b.x, oy = b.y, nx = b.x + b.vx * dt, ny = b.y + b.vy * dt
        if (windWall(nx, ny)) {
          // 壁に当たった: 当たった面（向き n）の上の点で、炎が面に沿って広がる
          let n
          if (windWall(nx, oy)) n = [-Math.sign(b.vx) || 1, 0]
          else if (windWall(ox, ny)) n = [0, -Math.sign(b.vy) || 1]
          else n = Math.abs(b.vx) > Math.abs(b.vy) ? [-Math.sign(b.vx), 0] : [0, -Math.sign(b.vy)]
          const cx = n[0] ? (n[0] < 0 ? Math.floor(nx / TILE) * TILE : (Math.floor(nx / TILE) + 1) * TILE) : ox
          const cy = n[1] ? (n[1] < 0 ? Math.floor(ny / TILE) * TILE : (Math.floor(ny / TILE) + 1) * TILE) : oy
          const heat = b.heat
          Object.assign(b, { st: 'crash', t: 0, x: cx, y: cy, n, heat, vx: 0, vy: 0 })
          for (let i = 0; i < 16; i++) { const s = (r() - 0.5) * 2, v = 30 + r() * 60; ember(cx, cy, -n[1] * s * v + n[0] * r() * 40, n[0] * s * v + n[1] * r() * 40 - 10, 0.5 + r() * 0.7) }
        } else {
          b.x = nx; b.y = ny
          if (b.st === 'blow' && b.t >= WIND.life) {
            b.st = 'fade'; b.t = 0
            for (let i = 0; i < 12; i++) { const a = r() * Math.PI * 2, v = 20 + r() * 40; ember(b.x, b.y, Math.cos(a) * v + b.vx * 0.3, Math.sin(a) * v + b.vy * 0.3, 0.5 + r() * 0.6) }   // ほどけて散る
          } else if (b.st === 'fade' && b.t >= WIND.fade) { b.st = 'gone'; b.t = 0 }
        }
        // 追う間の火の粉: 1 秒に 70 粒ほど（2026-11-07 に増やした）。体のまわりからこぼれ、跡に残って昇りながら冷える。ときどき大きい粒
        if (b.st === 'blow') for (let c = 70 * dt * b.heat; c > 0; c--) {
          if (c < 1 && r() > c) break
          const s = (r() - 0.5) * 14, f = r() * 0.12
          ember(b.x - b.vx * f + s * 0.4, b.y - b.vy * f + s, -b.vx * (0.1 + r() * 0.3) + (r() - 0.5) * 36, -b.vy * 0.2 - 10 - r() * 30, 0.35 + r() * 0.7, r() < 0.2)
        }
      } else if (b.st === 'crash') { b.heat = Math.max(0, b.heat - dt / WIND.crash); if (b.t >= WIND.crash) { b.st = 'gone'; b.t = 0 } }
      if (b.st === 'blow' || b.st === 'fade') b.trail.unshift({ x: b.x, y: b.y, t: S.time })
      b.trail = b.trail.filter((q) => S.time - q.t < WIND.trail)
      // 火の粉: 抵抗で速さが落ち、昇りながら冷える
      for (const e of b.embers) { e.t += dt; const k = Math.exp(-2.5 * dt); e.vx *= k; e.vy = e.vy * k - 30 * dt; e.x += e.vx * dt; e.y += e.vy * dt }
      b.embers = b.embers.filter((e) => e.t < e.life)
      if (b.st === 'blow' && !S.fly) {
        const h = hurtBox(p), cx = Math.max(h.l, Math.min(h.r, b.x)), cy = Math.max(h.t, Math.min(h.b, b.y))
        if (Math.hypot(cx - b.x, cy - b.y) < WIND.hit) { S.die('wind'); return true }
      }
    }
    return false
  }

  // 餓鬼の道の布施人（world.js の DONOR。体の動きは src/donor.js、絵は src/render/donor.js）:
  //   wander 床をうろうろ（x0〜x1。はじめは家の床）→ notice 気づく → follow ついて来る（uneasy 不安で立ち止まる → lost 見失う「?」→ その場の床でうろうろ）
  //   → offer 光の部屋（donor）で、座る所まで歩いてひざまずき、食べ物を置いて回向する（満ちたら、その生の間はそこにいる）。
  //   餓鬼が部屋を移ったら、ついて来ていない布施人（うろうろ・見失った・満ちる前の光の部屋）で、餓鬼のいない部屋にいるものは、そっと家へ戻す
  //   （画面の外で。2026-11-07。前は点滅して消えて家に戻っていたが、人らしくなかった）
  let donorRoomSeen = null
  const sendHome = (b) => Object.assign(b, { st: 'wander', t: 0, x: b.d.x, y: b.d.y, vx: 0, vy: 0, room: -1, kneel: null, offerAt: null, stuck: 0, side: 0, x0: b.d.x0, x1: b.d.x1, airVx: null, onGround: true })
  const stepDonors = (p, dt) => {
    const px = p.x, py = p.y
    if (S.room?.index !== donorRoomSeen) {
      donorRoomSeen = S.room?.index
      for (const b of S.donors) {
        const here = roomAt(world, b.x, b.y - 8)
        const loose = b.st === 'wander' || b.st === 'lost' || (b.st === 'offer' && !S.found.has(b.room))
        if (loose && here !== S.room && (b.x !== b.d.x || b.y !== b.d.y)) sendHome(b)
      }
    }
    for (const b of S.donors) {
      b.t += dt
      const dx = px - b.x, dy = py - b.y, zone = donorZone(dx, dy)
      const seen = Math.abs(dx) < DONOR.notice && Math.abs(dy) <= DONOR.noticeY   // 気づくのは、同じ高さで左右 1 マスほどまで
      const inRoom = roomAt(world, b.x, b.y - 8), lr = inRoom?.light && inRoom.donor ? inRoom : null
      let want = 0   // 歩きたい向きと速さ
      if (b.st !== 'offer' && lr && lr.index === b.d.target) { b.st = 'offer'; b.t = 0; b.room = lr.index; b.side = 0 }   // 結ばれた光の部屋でだけ施す（ほかの光の部屋は、普通の部屋と同じ。2026-11-08）
      if (b.st === 'wander') {
        // 床が狭い（1〜2 マス）ときは、うろうろせず、その場で見回す
        if (b.x1 - b.x0 < 24) b.dir = Math.floor(b.t / 1.2) % 2 ? -1 : 1
        else { if (b.x <= b.x0 + 1) b.dir = 1; else if (b.x >= b.x1 - 1) b.dir = -1; want = b.dir * DONOR.wander }
        if (seen) { b.st = 'notice'; b.t = 0 }
      } else if (b.st === 'notice') {
        if (Math.abs(dx) >= 4) b.dir = Math.sign(dx)
        if (b.t > 0.5) { b.st = 'follow'; b.t = 0 }
      } else if (b.st === 'follow') {
        if (zone === 'lose') { b.st = 'lost'; b.t = 0 }
        else if (zone === 'uneasy') { b.st = 'uneasy'; b.t = 0; b.lookDir = null }
        else if (zone === 'follow' || dy > 24) {
          // 餓鬼が真上・真下（左右の差が半マス未満）のときは、向きを決め直さない（毎コマ左右に振れて震えていた。2026-11-07）。
          //   真下なら今の向きのまま歩いて床の端から降り、真上なら立ち止まる
          if (Math.abs(dx) >= 8) b.dir = Math.sign(dx)
          want = Math.abs(dx) >= 8 || dy > 8 ? b.dir * DONOR.walk : 0
        }
      } else if (b.st === 'uneasy') {
        // 不安: 立ち止まって見回す（向きを替える）。そばの段に戻ればまたついて来る
        if (b.t === dt || b.lookDir == null) b.lookDir = Math.abs(dx) >= 8 ? Math.sign(dx) : b.dir   // 不安になった瞬間の向きから、時間で左右を見回す（餓鬼の位置で決めると、真上・真下で震えた）
        b.dir = Math.floor(b.t * 2.5) % 2 ? -b.lookDir : b.lookDir
        if (zone === 'follow' || zone === 'near') { b.st = 'follow'; b.t = 0 }
        else if (zone === 'lose' || b.t > DONOR.uneasy) { b.st = 'lost'; b.t = 0 }
      } else if (b.st === 'lost') {
        // 見失った: 「?」で立ち止まり、そのあと、その場の床でうろうろ
        if (seen) { b.st = 'follow'; b.t = 0 }
        else if (b.t > DONOR.lost && b.onGround) { [b.x0, b.x1] = floorSpanAt(world, b.x, b.y); b.st = 'wander'; b.t = 0 }
      } else if (b.st === 'offer') {
        // 座る所へ歩く。座る所が下なら床の端から降り、1 マスの穴は跳び越える（2026-11-07。前は降りられず、段の上で止まって施さなかった）。
        //   0.5 秒進めなければ、その場でひざまずいて施す（供える食べ物は目の前に。offerAt）
        const seat = world.rooms[b.room].seat
        if (!b.side) b.side = Math.sign(seat.x - b.x) || 1   // 座る所のどちら側に立つかは、一度だけ決める（毎コマ決め直すと、真上に降りたとき左右に行き来し続けた）
        const to = seat.x - 10 * b.side
        const atSeat = Math.abs(to - b.x) <= 2 && Math.abs(seat.y - b.y) < 4
        // 左右が合って高さだけ違う（座る所の真上の段にいる）ときは、座る所に向かう側（side）へ歩いて段の端から降りる（その場で行き来しないように）
        const above = seat.y > b.y + 8, near = Math.abs(to - b.x) <= (above ? 16 : 2)   // 座る所が下なら、左右 1 マス以内は「真上」として、端から降りるまで歩き続ける
        if (!b.kneel && !atSeat && (b.stuck || 0) < 0.5) want = (near ? b.side : Math.sign(to - b.x)) * DONOR.walk
        else if (!b.kneel && b.onGround) {
          b.kneel = S.time; b.dir = atSeat ? Math.sign(seat.x - b.x) || 1 : b.dir
          b.offerAt = atSeat ? null : { x: b.x + b.dir * 12, y: b.y }
        }
      }
      const offering = b.st === 'offer' && !b.kneel, seatY = offering ? world.rooms[b.room].seat.y : 0
      const blocked = moveDonor(b, world, want, (b.st === 'follow' && dy > 8) || (offering && seatY > b.y + 8), b.st === 'follow' || offering, dt)
      if (offering) b.stuck = blocked && b.onGround ? (b.stuck || 0) + dt : 0
      if (b.st === 'wander' && blocked) b.dir = -b.dir
      if (b.y > world.h * TILE) sendHome(b)   // 念のため（地図の外へ落ちたら家へ）
    }
  }

  S.step = (inp, T, dt) => {
    // 看板を読んでいる間は、世界の時計も止める（2026-11-11。本人の頼み。噴き出す炎・生きもの・町の人・転がる岩の周期は S.time で動くので、
    //   止めないと、窓の後ろで動き続け、閉じたときに急に進んでいた）
    if (!S.reading) S.time += dt
    for (const f of S.flowers) if (f.t < 9) f.t += dt
    for (const pt of S.petals) {
      pt.t += dt
      if (pt.t < 0 || pt.landed) continue
      // 空気に押されて速さが落ち、落ちる速さは頭打ち（ひらひら）。横に揺れる。地面（岩・針・炎）に着いたらそこで止まる
      const d = Math.exp(-3 * dt)
      pt.vx *= d; pt.vy = Math.min(22, pt.vy * d + 130 * dt)
      const nx = pt.x + (pt.vx + Math.sin(pt.t * 7 + pt.ph) * 14) * dt, ny = pt.y + pt.vy * dt
      const k = tileAt(world, Math.floor(nx / TILE), Math.floor(ny / TILE))
      if (isSolidKind(k) || (k !== K.air && ny % TILE > 8)) { if (pt.vy > 0) { pt.landed = true; pt.life = Math.min(pt.life, pt.t + 0.5) } continue }
      pt.x = nx; pt.y = ny
    }
    S.petals = S.petals.filter((pt) => pt.t < pt.life)
    if (S.bloom) { S.bloom.t += dt; if (S.bloom.t > 0.9) S.bloom = null }
    if (S.signBloom) { S.signBloom.t += dt; if (S.signBloom.t > 1.5) S.signBloom = null }
    if (S.discover) { S.discover.t += dt; if (S.discover.t > DISCOVER_TIME) S.discover = null }
    if (S.alms) S.alms.t += dt
    if (S.reveal) stepCrumble(S.reveal, dt)
    if (S.banner) { S.banner.t += dt; if (S.banner.t > 2.2) S.banner = null }
    if (S.dead) {
      S.dead.t += dt
      // 光の列が出る死（光を見つけた生・抜けるとき）は、ボタンを押すまで待つ（2026-11-05）。しばらくは受けない（押しっぱなしや連打の誤爆を避ける）
      const long = S.dead.escape || S.dead.light
      S.dead.canSkip = long && S.dead.t >= (S.dead.escape ? DEAD_SKIP.escape : DEAD_SKIP.light)
      if (long ? S.dead.canSkip && (inp.dashPressed || inp.okPressed) : S.dead.t >= DEAD_TIME) {
        if (!S.wander) S.lifeNo++   // 道をめぐる間は、生の数を増やさない
        if (S.dead.next) { rec(S.realm).spawn = S.spawn; enterRealm(S.dead.next); if (world.start) S.spawn = { x: world.start.x, y: world.start.y } }   // 次の道は、はじめから（前にその道の記録があっても。2026-11-07）
        save(); beginLife()
      }
      return
    }
    const p = S.player
    // 解脱したあとは、何も動かない（終わりの画面だけ。そのセーブは見るだけ）
    if (S.liberated && !S.wander) { S.ending = S.ending || { t: 0 }; S.ending.t += dt; return }
    // 看板を読んでいる間は止まる。ボタン（ダッシュ・X・Space・Esc）で閉じる（閉じる動きの間も止まったまま）。原典のページは、窓に触れる・クリック・Enter で開く（main.js。
    //   ブラウザは、キーや指の「その瞬間」にしかタブを開かせないので、キーのイベントの中で開く）。上・下では閉じない（間違えて閉じないように）
    if (S.reading) {
      const R = S.reading
      R.t += dt
      if (R.close != null) { R.close += dt; if (R.close >= SIGN_CLOSE) { S.reading = null; if (R.first) S.signBloom = { id: R.id, t: 0 } } }   // 初めて読んだ看板は、閉じたあと根もとに花が咲く
      else if (R.t > 0.2 && (inp.dashPressed || inp.okPressed)) S.closeReading()
      return
    }
    // 部屋を移る間は止まる（カメラだけ動く）
    if (S.pause > 0) { S.pause -= dt; moveCam(dt); return }
    // 天の道だけ: ふわりと軽い（重力が弱く、ゆっくり落ちる）
    const realm = REALMS[S.realm] || {}
    if (realm.sky) p.dashLeft = Math.max(p.dashLeft, 1)   // 天だけ: ダッシュをいつでも使える
    if (realm.sky) T = { ...T, gravity: T.gravity * FLOAT.gravity, maxFall: T.maxFall * FLOAT.maxFall, fallMul: T.fallMul * FLOAT.fallMul }
    // デバッグの「飛ぶ」（押している間。src/debug.js）: 重さを無視して方向キーの向きへ速く動く。死なない
    if (S.flyWas && !S.fly) { p.vx = 0; p.vy = 0 }   // 離したら、その場で止まってから落ちる（勢いで飛んで行かない）
    S.flyWas = S.fly
    const dashLeft0 = p.dashLeft
    if (S.fly) flyPlayer(p, world, inp, T, FLY_SPEED, dt)
    else { p.noGrab = S.carry != null; stepPlayer(p, world, inp, T, dt) }   // 運ぶ間は角につかまれない
    // 人の道: 運んでいる食べ物は、ダッシュするか、3 マス以上落ちて着地するとこぼれて、元の場所に戻る
    //   （2026-11-08 に、運ぶ間のダッシュの禁止をやめて、ダッシュしたらこぼれる、にした。壁にぶつかるとこぼれるのは、分かりにくいのでやめた）
    //   （増支部 5.148「敬って施す」。2026-11-08）。こぼれた乳粥は src/porridge.js の粒
    // こぼす: 乳粥の粒を、傾いた側（傾いていなければ進む向き）へ塊で飛び出させる
    const spillCarry = (p) => {
      S.giftGone.set(S.carry, S.time); S.carry = null   // 元の場所には GIFT_BACK 秒たってから戻る
      const dir = Math.sign(S.tilt || 0) || Math.sign(p.vx) || p.dir || 1
      if (S.porridge) {
        spillPorridge(S.porridge, dir)
        // 器: 小さく跳ね上がって、乳粥と逆の側へ少し飛び、ゆっくり回りながら落ちる（床も壁もすり抜け、画面の下で消える。2026-11-08）
        const c = S.porridge.pose
        S.fallBowl = { x: c.x, y: c.y, a: c.a, vx: -dir * 35, vy: -110, va: -dir * 3.5 }
      }
    }
    if (S.carry != null && !S.fly) {
      if (p.dashLeft < dashLeft0) { spillCarry(p); S.carryTop = null; S.sfx.push('crumble') }   // ダッシュした
      else if (!p.onGround && !p.climb) S.carryTop = Math.min(S.carryTop ?? p.y, p.y)
      else {
        const fell = S.carryTop != null && p.y - S.carryTop >= SPILL_FALL
        S.carryTop = null
        if (fell) { spillCarry(p); S.sfx.push('crumble') }
      }
    } else S.carryTop = null
    // 盆の傾き（S.tilt。負は左、正は右へ傾く）: 右へ歩くと左へ傾き、止まると戻る、逆へ歩くと早く戻る。歩き出しと着地でぐらっと。1 を越えるとこぼれる
    if (S.carry != null && !S.fly) {
      const dir = p.onGround && !p.climb && Math.abs(p.vx) > 20 ? Math.sign(p.vx) : 0, tilt = S.tilt || 0
      if (dir && !S.trayWalk) S.tilt = tilt - dir * TRAY.jolt   // 歩き出し
      else if (dir) S.tilt = tilt - dir * (Math.sign(tilt) === dir ? TRAY.back : TRAY.walk) * dt
      else S.tilt = Math.sign(tilt) * Math.max(0, Math.abs(tilt) - TRAY.settle * dt)
      if (p.onGround && S.trayAir != null && p.y - S.trayAir >= TILE) S.tilt += (Math.sign(S.tilt) || -(p.dir || 1)) * TRAY.jolt   // 着地
      S.trayAir = p.onGround ? null : Math.min(S.trayAir ?? p.y, p.y)
      S.trayWalk = !!dir
      if (Math.abs(S.tilt) >= 1) { spillCarry(p); S.sfx.push('crumble') }
    }
    if (S.carry == null) { S.tilt = 0; S.trayWalk = false; S.trayAir = null }
    // 乳粥の粒（見た目だけ）: 運ぶ間は器についていく。こぼれたあとは床に落ちて、1.6 秒で消える。渡した・死んだときは消す
    if (S.carry != null && !S.fly) { if (!S.porridge || S.porridge.free) S.porridge = makePorridge(bowlPose(p, S.tilt)); stepPorridge(S.porridge, bowlPose(p, S.tilt), Math.min(dt, 1 / 30), world, Math.abs(S.tilt || 0) > 0.5) }   // 傾きが半分を越えると、縁から少しずつこぼれる（見た目だけ）
    else if (S.porridge?.free) { stepPorridge(S.porridge, null, Math.min(dt, 1 / 30), world); if (S.porridge.ps[0].life > 1.6) S.porridge = null }
    else S.porridge = null
    if (S.fallBowl) {
      const b = S.fallBowl
      b.vy = Math.min(320, b.vy + 520 * dt); b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt
      if (b.y - 24 > S.cam.y + VIEW_H) S.fallBowl = null   // 画面の下を抜けた（器の縁まで）
    }
    if (realm.sky) {
      // 落ちたら（いる部屋の下を抜けたら）、足場へ戻る。立っている間は、そこを戻り先に覚える
      if (!S.fly && S.room && p.y >= (S.room.y + S.room.h) * TILE - 2) { fallBack(); return }
      if (p.onGround && !p.climb) S.safe = { x: p.x, y: p.y }
    }
    if (realm.oneWay) {
      // 後ろへは戻れない: 画面の左の端が壁（カメラは前へしか進まない）。2026-11-07 までは道の始まりも壁で、
      //   はじめの画面の真ん中から左（道の終わりの写し）へ行けなかったので、画面の左の端までは行けるようにした
      const wall = S.cam.x + HW + 1
      if (p.x < wall) { p.x = wall; if (p.vx < 0) p.vx = 0; if (p.dashVx < 0) p.dashVx = 0 }
    }
    if (S.rain) stepRain(dt)
    if (S.loopRun) stepLoop(p, dt)
    if (S.winds?.length && stepWinds(p, dt)) return
    if (world.crumbles?.length) stepCrumbles(p, dt)
    if (world.rockers?.length && stepRocks(p, dt)) return
    if (S.donors?.length) stepDonors(p, dt)
    // 看板: 前（同じ床の上、すぐそば）に立っていると読める。上を押すと開く（読んだ看板は記録に残る）
    S.signNear = null; S.signNearOff = 0
    if (p.onGround && !p.climb) for (const g of world.signs || []) if (g.id && signShown(world, g) && Math.abs(p.y - g.y) < 3) { const o = signOffsets(world, g).find((d) => Math.abs(p.x - g.x - d) < 12); if (o != null) { S.signNear = g; S.signNearOff = o; break } }   // 写しの看板（signOffsets）の前でも読める
    if (S.signNear && inp.downPressed) {   // 下で読む（2026-11-04 に上から変えた。上はダッシュの向きに使うので、看板のそばで上へダッシュしようとして開いてしまう）
      S.reading = { id: S.signNear.id, sign: S.signNear, t: 0, close: null, first: !S.signsRead.has(S.signNear.id) }
      S.sfx.push('sign')   // 効果音: 看板の窓が開く（main.js が鳴らす）
      S.signsRead.add(S.signNear.id); save()
      return
    }
    const cause = realm.sky || S.fly ? null : deadly(world, hurtBox(p), S.time, S.creatureTime) || (p.y > world.h * TILE ? 'fall' : null)
    if (cause) { S.die(cause); return }
    // 人の道: 施す食べ物に触ると拾う（一度に一つ。渡したものは無い）
    if (realm.folkLook && world.folk?.length) stepFolk(p, dt)
    if (world.gifts?.length && S.carry == null) {
      const b = hurtBox(p)
      for (const g of world.gifts) {
        if (S.given.has(g.index)) continue
        if (S.giftGone.has(g.index)) { if (S.time - S.giftGone.get(g.index) < GIFT_BACK + 0.4) continue; S.giftGone.delete(g.index) }   // こぼしてから、まだ戻っていない（現れきる 0.4 秒までは拾えない。立っている所に戻っても、現れるのが見えてから拾う）
        if (b.l < g.x + 5 && b.r > g.x - 5 && b.b > g.y - 10 && b.t < g.y) { S.carry = g.index; break }
      }
    }
    // 餓鬼の道: 食べ物に触ると、腐って消える（取ろうとしても得られない。『餓鬼事』1.9）
    if (world.foods?.length) {
      const b = hurtBox(p)
      for (const f of world.foods) {
        if (S.rotten.has(f.index)) continue
        const x = f.tx * TILE, y = f.ty * TILE
        if (b.l < x + 13 && b.r > x + 3 && b.b > y + 6 && b.t < y + 16) S.rotten.set(f.index, S.time)
      }
    }
    // すり抜けの岩に入ったら、つながった岩がまとめて消えて通路になる（以後ずっと）
    const gi = hiddenTouched(world, hurtBox(p))
    if (gi >= 0 && !S.revealed.has(gi)) {
      S.revealed.add(gi); openHidden(world, gi); S.reveal = crumble(gi); save()
      S.sfx.push('crumble')   // 効果音（main.js が鳴らす）
      // 岩の中の看板が出てきたか（崩れたときの光を金色に）
      S.reveal.sign = (world.signs || []).some((g) => g.inRock && world.hiddenOf[g.ty * world.w + g.tx] === gi)
    }
    // 扉: 扉を置いた部屋でない側から触れると、崩れて開く（以後ずっと）
    if (world.doorGroups.length) {
      const di = doorTouched(world, hurtBox(p), world.roomOf[Math.floor((p.y - 8) / TILE) * world.w + Math.floor(p.x / TILE)])
      if (di >= 0) { S.opened.add(di); openDoor(world, di); S.reveal = crumble(-1, world.doorGroups[di].tiles, di * 71 + 13); S.sfx.push('crumble'); save() }
    }
    // 部屋が変わったら、カメラを少しかけて移す
    const r = roomAt(world, p.x, p.y - 8)
    if (r && r !== S.room) {
      if (p.vy < 0 && r.y + r.h <= S.room.y) enterAbove(p, world, r, T)   // 下から上の部屋へ
      S.pause = ROOM_PAUSE
      S.camFrom = { ...S.cam }
      S.room = r
      startRoomClock(r, ROOM_PAUSE)   // カメラが移り終わってから、その部屋の時計が動き出す
      S.light = r.light && S.found.has(r.index) ? 1 : 0   // 見つけた光の部屋は、入ったときから明るい（広がる光は最初の一度だけ）
      S.listen = 0
      S.camT = 0
      // 経典（中部 130『天使経』）の場所に初めて入ったときだけ、その名前を出す（つなぎの部屋や光の部屋は出さない）
      //   2026-11-04 から、出すのは部屋の名前（右上と同じ）。経典の地名（place）は、出すかどうかの印。部屋ごとに一度
      const pk = `${S.realm}/${r.name}`
      if (r.place && !S.places.has(pk) && !S.banner?.big) { S.places.add(pk); S.banner = { text: roomName(r.name), t: 0 }; save() }
      pendingSpawn = true
    }
    // 光の部屋: はじめは普通の部屋に見える。一度見つけた部屋は、明るいまま
    //   地獄（approach）: 奥に座る地獄の者に近づくほど明るくなり、すぐそばまで来ると見つける
    //   畜生（listen）: 法を説く者のすぐそばで、地面に止まってじっと待つ。しばらく何も起きず、そのあと光が満ちて見つける（動くと最初から。謎解き）
    const lr = S.room?.light ? S.room : null
    let target = 0, foundNow = false
    if (lr && S.found.has(lr.index)) target = 1
    else if (lr?.seat) {
      const d = Math.hypot(p.x - lr.seat.x, p.y - lr.seat.y)
      if (REALMS[S.realm]?.light === 'alms') {
        // 人（alms）: 運んで来た施す食べ物を、托鉢の僧に渡す（僧に触れる）。食べ物と結ばれた光の部屋の僧だけが受け取る（2026-11-08）
        const b = hurtBox(p)
        foundNow = S.carry != null && world.gifts[S.carry]?.target === lr.index && b.l < lr.seat.x + 7 && b.r > lr.seat.x - 7 && b.b > lr.seat.y - 20 && b.t < lr.seat.y
        if (foundNow) { S.given.add(S.carry); S.carry = null; S.alms = { room: lr.index, t: 0 } }
      } else if (REALMS[S.realm]?.light === 'offering' && lr.donor) {
        // 餓鬼（donor の部屋。2026-11-07）: 連れて来た布施人が、食べ物を置いて回向するのを、同じ部屋で見届けると見つける
        const b = S.donors?.find((b) => b.st === 'offer' && b.room === lr.index)
        target = b ? (b.kneel ? Math.min(1, (S.time - b.kneel) / DONOR.kneel) * 0.6 : 0.15) : 0
        foundNow = !!b?.kneel && S.time - b.kneel >= DONOR.kneel
      } else if (REALMS[S.realm]?.light === 'offering') {
        // 餓鬼（offering）: 生きている人が置いていった供養の食べ物に、消える前に触れると見つける
        const st = offeringAt(lr, S.time), b = hurtBox(p)
        foundNow = st.food && b.l < lr.seat.x + 6 && b.r > lr.seat.x - 6 && b.b > lr.seat.y - 10 && b.t < lr.seat.y
      } else if (REALMS[S.realm]?.light === 'listen') {
        const still = p.onGround && !p.climb && Math.abs(p.vx) < 4 && !inp.x && !inp.dash
        S.listen = still && d <= LISTEN_RANGE ? S.listen + dt : 0
        S.nearT = d <= LISTEN_RANGE ? S.nearT + dt : 0   // そばに入ってからの時間（声の波紋の 1 本目が、ここから生まれる）
        target = Math.max(0, Math.min(1, (S.listen - LISTEN_WAIT) / LISTEN_FILL))
        foundNow = S.listen >= LISTEN_WAIT + LISTEN_FILL
      } else {
        target = Math.max(0, Math.min(1, (LIGHT_FAR - d) / (LIGHT_FAR - LIGHT_NEAR)))
        foundNow = d <= LIGHT_NEAR
      }
      if (foundNow) {
        S.found.add(lr.index); S.foundThisLife++
        openDoorsOf(world, lr.index)
        S.banner = { text: { listen: tr.heard, offering: tr.rejoice, alms: tr.gave }[REALMS[S.realm]?.light] ?? tr.found, t: 0, light: true }
        S.discover = { x: p.x, y: p.y - 8, t: 0, seed: lr.index * 31 }
        S.bless = { room: lr.index, at: S.time }   // 祝福の花びら: 見つけた瞬間は多めにぱっと舞う（src/render/effects.js の drawBlessing）
        target = 1
        save()
      }
    }
    S.light += Math.max(-dt * 3, Math.min(dt * 3, target - S.light))
    if (pendingSpawn && !fixedSpawn && p.onGround && !p.climb && roomAt(world, p.x, p.y - 8) === S.room) {
      S.spawn = { x: Math.round(p.x), y: Math.round(p.y) }
      pendingSpawn = false
      save()
    }
    moveCam(dt)
  }
  const moveCam = (dt) => {
    const to = camTarget()
    if (S.camT < 1) {
      S.camT = Math.min(1, S.camT + dt / ROOM_PAUSE)
      const k = 1 - (1 - S.camT) ** 3
      S.cam = { x: Math.round(S.camFrom.x + (to.x - S.camFrom.x) * k), y: Math.round(S.camFrom.y + (to.y - S.camFrom.y) * k) }
    } else S.cam = to
    if (REALMS[S.realm]?.oneWay) { if (S.camMin != null) S.cam.x = Math.max(S.cam.x, S.camMin); S.camMin = S.cam.x }   // 再び人: カメラは前へだけ
  }

  // デバッグ（?at=）: その場所から生を始め直す。x, y は足もと
  S.warp = (x, y) => { S.spawn = { x, y }; beginLife() }

  load()
  // startRealm: タイトルの「道を選ぶ」（開発中だけ）で、記録に関わらずその道から
  S.wander = wander
  if (startRealm && maps[startRealm]) S.realm = startRealm
  enterRealm(S.realm)
  // 開発中の「始める道」（startRealm）: その道のはじめから（記録に残った生まれる所は使わない。2026-11-07。再び人で、前に試した道の終わりから始まっていた）
  if (startRealm && maps[startRealm] && world.start) S.spawn = { x: world.start.x, y: world.start.y }
  beginLife()
  return S
}
