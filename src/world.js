// 地図: 部屋（src/maps.js の MAPS の、道ごとの部屋の一覧）をつないで、一枚の大きなタイルの地図にする
//   # 岩  . 空  S はじまり
//   ~ 炎の穴（触れると死ぬ）  ^ 床の針  v 天井の針  > 左の壁の針（右向き）  < 右の壁の針（左向き）
//   F 噴き出す炎の口（乗れる。決まった間隔で上へ噴く）
//   H すり抜けの岩（見た目は岩。入ると、つながった H がまとめて消えて通路になり、以後ずっと開いたまま）
//   D 片側からだけ開く扉（見た目は岩で、通れない。扉を置いた部屋の側から触れても開かず、ほかの部屋の側から触れると開く。
//     となりの光の部屋を見つけたときも開く。開いたら以後ずっと開いたまま。2026-11-06 に光の部屋に限らなくした）
//   生き物（畜生の道。そのマスは空。動きは時間で決まる周期で、見ていれば読める。creatureAt）:
//   E 鳥（そのマスの枝で待ち、真下の地面まで急降下して戻る）  P 魚（水〈~〉の中。水面から跳ねて落ちる）  N 蛇（その床の上を、端から端まで這って往復する）
//   W 熱い風の生まれる所（餓鬼の道。そのマスは空。地面のすぐ上のマスに置く: 足もとからつむじ風が立ち、マスの真ん中から風が出る。
//     餓鬼が近づくと風が生まれて追ってくる。『餓鬼事』3.6。WIND・game.js の stepWinds）
//   Q サーリプッタ（餓鬼の道。布施人と同じ動きで、絵と回向の言葉がサーリプッタ。餓鬼事 2.2）
//   Y 布施人（餓鬼の道。そのマスは空。2026-11-07）: 餓鬼が少し見える、感覚の鋭い生きている人。その床の上をうろうろし、餓鬼が近づくとついて来る。
//     部屋に donor: true の光の部屋（その餓鬼のもとの家）へ連れて来ると、食べ物を置いて回向する（餓鬼事 1.5）。DONOR・game.js の stepDonors
//   餓鬼の道: O 食べ物（触ると腐って消える。害は無い）  M 町の人（その床の上を行き来する。餓鬼に気づかず、すり抜ける。害は無い）
//   再び人: T 誘うもの（触れると味わえる。触れた周は、輪が切れない）。部屋に loop: 一周の長さ（タイル）があると、その長さで道が最初に戻る
//   看板: B（どの看板かは、部屋の "signs": { "x,y": 番号 }。x, y は部屋の中のマス。下キーで読む。src/signs.js）。そのマスは空
//   b 岩の中の看板（2026-11-05）: すり抜けの岩（H）と同じ岩で、崩れると（隣の H・b と一緒に）そのマスに看板が現れる。崩れるまでは見えず、読めない
//   人の道: G 施す食べ物（拾って運び、脇の部屋の托鉢の僧に渡す）。M の町の人は、人の道ではこちらを向く
//   道によって見た目が変わる: ~ は地獄では炎、畜生では水（大きな魚が潜む。落ちると食われる）、餓鬼では川（近づくと血に変わる）、人では川（流される）。針は地獄のほかでは棘
// 部屋に light: true を付けると光の部屋（スポット）。入った瞬間に見つけたことになる
import { OFFER_PERIOD, OFFER_SHOW, OFFER_WALK, OFFER_KNEEL, REALMS } from './realms.js'

export const TILE = 16
export const K = { air: 0, rock: 1, fire: 3, spikeUp: 4, spikeDown: 5, spikeRight: 6, spikeLeft: 7, jet: 8, hidden: 9, door: 10, fakeFire: 11, crumble: 13 }   // crumble: 崩れる岩（人の道。しばらく乗っていると崩れて空になる。2026-11-10。12 は前の沈む石で、使わない）   // fakeFire: すり抜けの炎（見た目は炎、触れても死なず、落ちて抜けられる。2026-11-06）
const CH = { '#': K.rock, '.': K.air, S: K.air, '~': K.fire, '^': K.spikeUp, v: K.spikeDown, '>': K.spikeRight, '<': K.spikeLeft, F: K.jet, H: K.hidden, D: K.door, E: K.air, P: K.fire, N: K.air, O: K.air, M: K.air, G: K.air, T: K.air, B: K.air, b: K.hidden, L: K.fakeFire, W: K.air, Y: K.air, Q: K.air, C: K.crumble, R: K.air }

// strict: false なら、おかしな所があっても止めずに problems に並べる（エディタ用）
export function buildWorld(rooms, { strict = true, realm = 'hell' } = {}) {
  const problems = [], warnings = []   // problems: 間違い（strict なら止める）。warnings: 気になる所（止めない。エディタに出す）
  const fail = (msg) => { if (strict) throw new Error(msg); problems.push(msg) }
  let w = 0, h = 0
  for (const r of rooms) {
    const rw = r.rows[0].length
    r.rows.forEach((row, i) => { if (row.length !== rw) fail(`${r.name} の ${i} 行目の長さが ${row.length}（${rw} のはず）`) })
    w = Math.max(w, r.x + rw); h = Math.max(h, r.y + r.rows.length)
  }
  const t = new Uint8Array(w * h).fill(K.rock)
  const roomOf = new Int16Array(w * h).fill(-1)
  let start = null
  const jets = [], rockers = [], creatures = [], foods = [], folk = [], winds = [], donors = [], gifts = [], tempts = [], signs = []
  const built = rooms.map((r, ri) => {
    r.rows.forEach((row, j) => [...row].forEach((c, i) => {
      const x = r.x + i, y = r.y + j
      if (roomOf[y * w + x] !== -1) { fail(`${r.name} が ${rooms[roomOf[y * w + x]].name} と重なっている（${x}, ${y}）`); return }
      roomOf[y * w + x] = ri
      t[y * w + x] = CH[c] ?? K.rock
      if (c === 'S') start = { x: x * TILE + TILE / 2, y: (y + 1) * TILE }
      if (c === 'F') jets.push({ x, y, phase: (((-x * JET.wave / JET.period) % 1) + 1) % 1 })   // 左から順に噴く（右へ 1 マスごとに JET.wave 秒遅れる。どの部屋も同じ波）
      if (c === 'R') rockers.push({ tx: x, ty: y, index: rockers.length, ri })   // 転がる岩の出る所（向きは下で決める）
      if (c === 'O') foods.push({ tx: x, ty: y, index: foods.length })
      if (c === 'M') folk.push({ tx: x, ty: y, index: folk.length })
      if (c === 'Y' || c === 'Q') donors.push({ tx: x, ty: y, x: x * TILE + 8, y: (y + 1) * TILE, index: donors.length, sariputta: c === 'Q', link: r.donors?.[`${i},${j}`] || null, home: ri })   // link: 結んだ光の部屋（「道の番号-光の部屋の番号」。部屋の donors: { "x,y": "3-5" }。2026-11-08）   // Q はサーリプッタ（布施人ごとに決める。2026-11-07。前は部屋の sariputta: true で決めていた）
      if (c === 'W') winds.push({ tx: x, ty: y, x: x * TILE + 8, y: y * TILE + 8, index: winds.length, ri })   // ri: 生まれる部屋（その部屋にいるときだけ生まれる）
      if (c === 'T') tempts.push({ tx: x, ty: y, index: tempts.length, x: x * TILE + TILE / 2, y: (y + 1) * TILE, kind: (x * 3 + y) % 5 })
      if (c === 'B' || c === 'b') signs.push({ tx: x, ty: y, x: x * TILE + TILE / 2, y: (y + 1) * TILE, id: r.signs?.[`${x - r.x},${y - r.y}`] || null, realm, index: signs.length, inRock: c === 'b' })   // id が無い看板は、読めない（エディタの見本など）
      if (c === 'G') gifts.push({ tx: x, ty: y, index: gifts.length, x: x * TILE + TILE / 2, y: (y + 1) * TILE, link: r.gifts?.[`${i},${j}`] || null, home: ri })   // link: 結んだ光の部屋（部屋の gifts: { "x,y": "4-1" }。2026-11-08）
      if (c === 'E' || c === 'P' || c === 'N') creatures.push({ kind: { E: 'bird', P: 'fish', N: 'snake' }[c], tx: x, ty: y, phase: (x * 0.61 + y * 0.29) % 1, ri })   // ri: いる部屋（部屋の時計。game.js の roomTime）
    }))
    return { name: r.name, x: r.x, y: r.y, w: r.rows[0].length, h: r.rows.length, light: !!r.light, no: r.light ? r.no ?? null : null, index: ri, seatAt: r.seat || null, place: r.place || null, buddha: !!r.buddha, donor: !!r.donor, scene: r.scene || null, sariputta: !!r.sariputta, loop: r.loop || null, loopStart: r.loopStart || 0, end: !!r.end }
  })
  // 輪の道（再び人）の写し（2026-11-07）: 道の始まりの手前 1 画面（20 列）は道の終わりの地形の写し、道の終わりの先 1 画面は道の始まりの地形の写し。
  //   地図に手で写さなくても、ここで地形（タイルの種類）だけをそろえる（継ぎ目で景色が飛ばないように）。看板・誘うもの・生き物などは地形ではないので、
  //   写しの場所にあっても消えない（誘うもの・看板・花は、描くときに一周ずらして写す）
  for (const r of built) {
    if (!r.loop) continue
    const x0 = r.x + r.loopStart, L = r.loop, inRoom = (x) => x >= r.x && x < r.x + r.w
    for (let y = r.y; y < r.y + r.h; y++) for (let i = 0; i < LOOP_COPY; i++) {
      if (inRoom(x0 - LOOP_COPY + i)) t[y * w + x0 - LOOP_COPY + i] = t[y * w + x0 + L - LOOP_COPY + i]
      if (inRoom(x0 + L + i)) t[y * w + x0 + L + i] = t[y * w + x0 + i]
    }
  }
  // 光の部屋の地獄の者が座る所（足もとの真ん中、ドット）。部屋に seat: [列, 行]（部屋の中の座標。その行の空のマスに座る）が無ければ、
  // いちばん低い床（下が岩で、上 2 マスが空）の、部屋の真ん中に近いマス
  for (const b of built) {
    if (!b.light) continue
    let best = null
    if (b.seatAt) best = { tx: b.x + b.seatAt[0], ty: b.y + b.seatAt[1] }
    else for (let y = b.y + 1; y < b.y + b.h - 1; y++) for (let x = b.x + 1; x < b.x + b.w - 1; x++) {
      const at = (xx, yy) => t[yy * w + xx]
      if (at(x, y) !== K.air || at(x, y - 1) !== K.air || ![K.rock, K.door].includes(at(x, y + 1))) continue
      const score = y * 100 - Math.abs(x + 0.5 - (b.x + b.w / 2))
      if (!best || score > best.score) best = { tx: x, ty: y, score }
    }
    b.seat = best ? { x: best.tx * TILE + TILE / 2, y: (best.ty + 1) * TILE } : null
  }
  // つながった H・D をまとめる（すり抜けの通路、扉）
  const groupsOf = (kind) => {
    const seen = new Uint8Array(w * h), groups = []
    for (let i = 0; i < w * h; i++) {
      if (t[i] !== kind || seen[i]) continue
      const g = [], q = [i]
      seen[i] = 1
      while (q.length) {
        const c = q.pop(); g.push(c)
        const cx = c % w, cy = (c / w) | 0
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy, n = ny * w + nx
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[n] || t[n] !== kind) continue
          seen[n] = 1; q.push(n)
        }
      }
      groups.push(g)
    }
    return groups
  }
  const hiddenGroups = groupsOf(K.hidden)
  const hiddenOf = new Int16Array(w * h).fill(-1)
  hiddenGroups.forEach((g, gi) => g.forEach((c) => (hiddenOf[c] = gi)))
  // 扉: room は扉を置いた部屋（その側からは開かない）。light は、扉のタイルがある光の部屋か、扉にとなり合う光の部屋（見つけると開く。無ければ -1）
  const doorGroups = groupsOf(K.door).map((g) => {
    let room = built[roomOf[g[0]]]?.light ? roomOf[g[0]] : -1
    for (const c of g) {
      if (room >= 0) break
      const cx = c % w, cy = (c / w) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const ri = roomOf[ny * w + nx]
        if (ri >= 0 && built[ri].light) { room = ri; break }
      }
    }
    return { tiles: g, room: roomOf[g[0]], light: room }
  })
  if (!start) fail('はじまり（S）が無い')
  // 生き物の道のりを、地図から決めておく
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? K.rock : t[y * w + x])
  // 床の上を行き来できる左右の端（ドット。体の真ん中）
  const floorSpan = (tx, ty) => {
    const floor = (x) => at(x, ty) === K.air && isSolidKind(at(x, ty + 1))
    let x0 = tx, x1 = tx
    while (floor(x0 - 1)) x0--
    while (floor(x1 + 1)) x1++
    return [x0 * TILE + 7, (x1 + 1) * TILE - 7]
  }
  for (const d of donors) [d.x0, d.x1] = floorSpan(d.tx, d.ty)   // 布施人が、はじめにうろうろする床
  for (const f of folk) { [f.x0, f.x1] = floorSpan(f.tx, f.ty); f.speed = 14 + ((f.tx * 7 + f.ty * 13) % 11) * 1.6; f.phase = ((f.tx * 0.37 + f.ty * 0.71) % 1) }
  // 供養の場（餓鬼の道の光の部屋）: 生きている人が、床の遠い方の端から座る所（seat）まで歩いて来て、食べ物を置いて戻る
  for (const b of built) {
    if (!b.light || !b.seat || b.donor) continue   // 布施人を連れて来る部屋（donor）は、ひとりでには供養の人が来ない
    const sx = Math.floor(b.seat.x / TILE), sy = Math.floor(b.seat.y / TILE) - 1
    const [x0, x1] = floorSpan(sx, sy)
    const room0 = b.x * TILE + 8, room1 = (b.x + b.w) * TILE - 8
    const l = Math.max(x0, room0), r = Math.min(x1, room1)
    b.offer = { from: b.seat.x - l > r - b.seat.x ? l : r, phase: (b.index * 0.137) % 1 }
  }
  for (const c of creatures) {
    if (c.kind === 'bird') {
      let y = c.ty + 1; while (y < h && at(c.tx, y) === K.air) y++; c.groundY = y * TILE
      // 左右に飛ぶ幅: その高さで左右に空いているマス（3 マスまで。少ない側に合わせる）
      let l = 0, r = 0
      while (l < 3 && at(c.tx - l - 1, c.ty) === K.air) l++
      while (r < 3 && at(c.tx + r + 1, c.ty) === K.air) r++
      c.range = Math.min(l, r) * TILE
    }
    if (c.kind === 'snake') {
      // 自分の部屋の中だけを這う（2026-11-11。前は床が続けば隣の部屋まで行き、隣の部屋に入った瞬間に、別の部屋の時計で動く蛇に当たることがあった）
      const floor = (x) => at(x, c.ty) === K.air && isSolidKind(at(x, c.ty + 1)) && roomOf[c.ty * w + x] === c.ri
      let x0 = c.tx, x1 = c.tx
      while (floor(x0 - 1)) x0--
      while (floor(x1 + 1)) x1++
      c.x0 = x0 * TILE + 7; c.x1 = (x1 + 1) * TILE - 7
    }
  }
  // 輪の道（再び人）: loop のある部屋の、一周の始まりと長さ（ドット）
  const lr = built.find((b) => b.loop)
  const loop = lr ? { x0: (lr.x + (lr.loopStart || 0)) * TILE, len: lr.loop * TILE, room: lr.index } : null   // loopStart: 道の始まりの列（その左は道の終わりの写し）
  // 光の部屋の番号（2026-11-08）: どの光の部屋にも番号が要り、同じ番号は二つ置けない（間違い）。lightNo: 番号 → 部屋の番号
  const lightNo = new Map()
  for (const b of built) {
    if (!b.light) continue
    if (b.no == null) { fail(`光の部屋 ${b.index}「${b.name}」に番号（no）が無い`); continue }
    if (lightNo.has(b.no)) fail(`光の部屋の番号 ${b.no} が二つ: 部屋 ${lightNo.get(b.no)} と ${b.index}`)
    else lightNo.set(b.no, b.index)
  }
  // 布施人の結びつき: link（「3-5」）の光の部屋（target。無ければ -1）。結んでいない・違う道・無い番号は気になる所に
  const realmNo = REALMS[realm]?.no
  for (const d of donors) {
    d.target = -1
    const where = `部屋 ${d.home}「${built[d.home].name}」(${d.tx - built[d.home].x}, ${d.ty - built[d.home].y})`
    if (!d.link) { warnings.push(`布施人が光の部屋に結ばれていない: ${where}`); continue }
    const m = /^(\d+)-(\d+)$/.exec(d.link)
    if (!m || +m[1] !== realmNo || !lightNo.has(+m[2])) { warnings.push(`布施人の結びつき ${d.link} の光の部屋が無い: ${where}`); continue }
    d.target = lightNo.get(+m[2])
  }
  for (const b of built) if (b.light && b.donor && !donors.some((d) => d.target === b.index)) warnings.push(`誰も結ばれていない光の部屋: ${realmNo}-${b.no}（部屋 ${b.index}）`)
  // 施す食べ物の結びつき（人の道。2026-11-08）: 布施人と同じ形。結ばれた光の部屋の僧だけが受け取る
  for (const g of gifts) {
    g.target = -1
    const where = `部屋 ${g.home}「${built[g.home].name}」(${g.tx - built[g.home].x}, ${g.ty - built[g.home].y})`
    if (!g.link) { warnings.push(`施す食べ物が光の部屋に結ばれていない: ${where}`); continue }
    const m = /^(\d+)-(\d+)$/.exec(g.link)
    if (!m || +m[1] !== realmNo || !lightNo.has(+m[2])) { warnings.push(`施す食べ物の結びつき ${g.link} の光の部屋が無い: ${where}`); continue }
    g.target = lightNo.get(+m[2])
  }
  if (REALMS[realm]?.light === 'alms') for (const b of built) if (b.light && !gifts.some((g) => g.target === b.index)) warnings.push(`施す食べ物が結ばれていない光の部屋: ${realmNo}-${b.no}（部屋 ${b.index}）`)
  // 転がる岩の向き: 壁を背にして空いている側へ。両側が空いていれば部屋の真ん中の側へ
  for (const q of rockers) {
    const l = isSolidKind(t[q.ty * w + q.tx - 1]), r = isSolidKind(t[q.ty * w + q.tx + 1]), room = built[q.ri]
    q.dir = l && !r ? 1 : r && !l ? -1 : q.tx < room.x + room.w / 2 ? 1 : -1
    q.x = q.tx * TILE + TILE / 2; q.y = (q.ty + 1) * TILE
    q.phase = (((q.tx * 0.37 + q.ty * 0.53) % 1) + 1) % 1   // 出る拍子（場所ごとにずらす）
  }
  const crumbles = []; for (let i = 0; i < t.length; i++) if (t[i] === K.crumble) crumbles.push(i)   // 崩れる岩のマス（崩れたら空になり、次の生で元に戻す）
  return { w, h, t, crumbles, start, rooms: built, rockers, jets, creatures, foods, folk, winds, donors, gifts, tempts, signs, loop, roomOf, hiddenGroups, hiddenOf, doorGroups, problems, warnings, lightNo, realm }
}

export const tileAt = (world, tx, ty) => (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h ? K.rock : world.t[ty * world.w + tx])
export const isSolidKind = (k) => k === K.rock || k === K.jet || k === K.door || k === K.crumble

// すり抜けの通路を開く・扉を開く（タイルを空にする）
// 看板が見えるか（岩の中の看板は、岩が崩れるまで見えない）
export const LOOP_COPY = 20   // 輪の道の写しの幅（列。継ぎ目の両側に 1 画面ずつ）
export const signShown = (world, g) => !g.inRock || world.t[g.ty * world.w + g.tx] !== K.hidden
// 再び人: 看板が描かれる・読める所のずれ（0 は元の場所）。継ぎ目の近くの看板は、継ぎ目の向こうの写しの画面にも出る（2026-11-08 に、写しの看板も読めるようにした。
//   前は絵だけで、渇愛が尽きたあとの写しの画面や、道の始まりの左の写しの画面の看板が読めなかった）
export function signOffsets(world, g) {
  const lp = world.loop, out = [0]
  if (!lp) return out
  if (g.x >= lp.x0 && g.x < lp.x0 + LOOP_COPY * TILE) out.push(lp.len)
  if (g.x >= lp.x0 + lp.len - LOOP_COPY * TILE && g.x < lp.x0 + lp.len) out.push(-lp.len)
  return out
}
export function openHidden(world, gi) { for (const c of world.hiddenGroups[gi]) world.t[c] = K.air }
export function openDoorsOf(world, roomIndex) { for (const d of world.doorGroups) if (d.light === roomIndex) for (const c of d.tiles) world.t[c] = K.air }
export function openDoor(world, di) { for (const c of world.doorGroups[di].tiles) world.t[c] = K.air }
// 扉に触れたか: box（体）を少し広げて、扉のタイルに重なるか。扉を置いた部屋（fromRoom がそれと同じ）からは開かない。触れた扉の番号か -1
export function doorTouched(world, box, fromRoom) {
  const tx0 = Math.floor((box.l - 3) / TILE), tx1 = Math.floor((box.r + 3 - 0.01) / TILE)   // 体（hurtBox は少し小さい）がぶつかる所まで
  const ty0 = Math.floor((box.t - 5) / TILE), ty1 = Math.floor((box.b + 3 - 0.01) / TILE)
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) continue
    const i = ty * world.w + tx
    if (world.t[i] !== K.door) continue
    const di = world.doorGroups.findIndex((d) => d.tiles.includes(i))
    if (di >= 0 && world.doorGroups[di].room !== fromRoom) return di
  }
  return -1
}

// 噴き出す炎: 休み → 予兆（火の粉） → 噴く。長さは 3 タイル
// 熱い風（餓鬼の道。2026-11-07）: wake 餓鬼がこれより近づくと生まれる（生まれる所から。ドット）、gather つむじ風が締まって熱くなる間（ため。秒）、
//   speed 最高速（走る 138 の 4 分の 3 ほど。ダッシュなら振り切れる）、accel 向きを変える力の上限（慣性。急に向きを変えると行き過ぎる）、
//   life 追う間（燃え尽きる。最後の cool 秒は冷めはじめる）、fade 燃え尽きて散る間、crash 壁に当たって広がり消える間、hit 当たりの半径（頭のあたりだけ）、trail 跡の長さ（秒）。
//   一度消えたら、その生の間は二度と出ない（死ぬと戻る）
// 布施人（餓鬼の道。2026-11-07。動きは src/donor.js）: notice 餓鬼が同じ高さ（足もとの差が noticeY まで）で、左右にこれより近づくと気づいてついて来る
//   （1 マスほど。上や下からは気づかない）。ついて来ている間の離れ（横は厳しく、縦はゆるく）: uneasyX・uneasyY を越えると不安になって立ち止まり、
//   見回す（「…」。uneasy 秒のうちに戻れば、またついて来る）。loseX・loseY を越えるか、不安のまま uneasy 秒たつと見失う（「?」。そのあと、その場の床でうろうろ。餓鬼が部屋を移ると、家へそっと戻る）。
//   wander うろうろする速さ、walk ついて来る速さ（走る 138 より遅い）、near これより近いと止まって待つ、stepV 1 マスの段を上る跳び、gapV・gapVx 1 マスの穴を越える跳び、
//   lost 見失って立ち止まる間（秒）、kneel 置くまでひざまずく時間。高い所から落ちても死なない。川（血の川）には入らない。熱い風は見えない
export const DONOR = { notice: 24, noticeY: 8, uneasyX: 72, loseX: 96, uneasyY: 136, loseY: 176, uneasy: 1.0, wander: 16, walk: 46, near: 16, gravity: 900, maxFall: 260, stepV: 200, gapV: 170, gapVx: 80, lost: 1.2, gone: 0.6, kneel: 1.2 }   // 2026-11-07: 横は左右 1 マスずつ甘く（uneasyX 56→72・loseX 80→96）
export const WIND = { wake: 80, gather: 0.7, speed: 105, accel: 260, life: 3.0, cool: 0.6, fade: 0.8, crash: 0.9, hit: 6, trail: 0.45 }
// 人の道の崩れる岩（C。2026-11-10）: 乗るか、しがみつくと崩れはじめ、hold 秒で崩れて空になる（一度崩れはじめたら、離れても最後まで崩れる）。崩れる間は揺れる。
//   崩れて back 秒たつと、appear 秒かけてぽつぽつ元に戻る（そのマスに体が重なっている間は待つ）。次の生でも元に戻る
export const CRUMBLE = { hold: 0.7, back: 3.0, appear: 0.3 }
// 人の道の転がる岩（R。2026-11-08）: period 秒ごとに出る。出る warn 秒前から小石がぱらぱら落ちる。床を speed で転がり、床が終われば落ちる。
//   壁に当たると砕ける。川に落ちると沈む。当たると死ぬ。乗れない。大きさはプレイヤーと同じ 16 × 16
export const ROCK = { period: 4.0, warn: 1.0, speed: 62, gravity: 900, maxFall: 300, r: 8 }
export const JET = { period: 4.35, warn: 1.0, on: 0.85, height: 3, wave: 0.1 }   // 2026-11-05: 当たらない時間（休み＋予兆）を 1.75 秒から 3.5 秒に倍に（噴く 0.85 秒はそのまま。前は period 2.6）。予兆も 0.5 から 1.0 秒に（休みは 2.5 秒）。
//   wave: 噴き出しが、右へ 1 マスごとに遅れて噴く秒。どの部屋でも左から順に噴く波になる（2026-11-06。0.1 秒＝波は毎秒 160 ドットで、歩く速さ 138 より少し速い。噴き終わった直後に後ろを歩けば通れる）
export function jetState(jet, time) {
  const f = ((time / JET.period + jet.phase) % 1) * JET.period
  const offEnd = JET.period - JET.warn - JET.on
  if (f < offEnd) return 'off'
  if (f < offEnd + JET.warn) return 'warn'
  return 'on'
}

// 生き物の今の姿: { x, y（体の真ん中）, frame, show（見えている）, danger（触れると死ぬ）, warn（動き出す前の予兆）, dir }
// 鳥（2026-11-06 に作り直した。前は宙で止まって待ち、真下へ降りていた）: 巣の高さで左右に飛び回り（patrol 秒で、真ん中 → 右 → 左 → 真ん中）、
//   真ん中で一瞬止まって震え（warn）、真下の地面へ突き刺さるように急降下（dive。だんだん速く）、刺さったまま少し止まり（rest）、羽ばたいて戻る（rise）。
//   突き刺さるのはいつも巣の真下（地図の E の列）なので、見ていれば読める
export const BIRD = { patrol: 2.4, warn: 0.4, dive: 0.22, rest: 0.35, rise: 0.75 }, FISH = { period: 3.0, wait: 1.7, warn: 0.5, air: 1.0, height: 3.4 }, SNAKE = { speed: 24 }
BIRD.period = BIRD.patrol + BIRD.warn + BIRD.dive + BIRD.rest + BIRD.rise
export function creatureAt(c, time) {
  const cx = c.tx * TILE + TILE / 2
  if (c.kind === 'bird') {
    const f = ((time / BIRD.period + c.phase) % 1) * BIRD.period, top = c.ty * TILE + 8, low = c.groundY - 6
    const flap = Math.floor(time * 10) % 2 ? 'flap1' : 'flap2'
    let k = f
    if (k < BIRD.patrol) {
      const a = (k / BIRD.patrol) * Math.PI * 2, R = c.range ?? 0
      return { x: cx + R * Math.sin(a), y: top + Math.sin(a * 2) * 1.5, frame: flap, show: true, danger: true, dir: Math.cos(a) >= 0 ? 1 : -1 }
    }
    k -= BIRD.patrol
    if (k < BIRD.warn) return { x: cx, y: top, frame: flap, show: true, danger: true, warn: true }
    k -= BIRD.warn
    if (k < BIRD.dive) { const u = k / BIRD.dive; return { x: cx, y: top + (low - top) * u * u, frame: 'dive', show: true, danger: true } }
    k -= BIRD.dive
    if (k < BIRD.rest) return { x: cx, y: low, frame: 'dive', show: true, danger: true }
    k -= BIRD.rest
    const u = Math.min(1, k / BIRD.rise)
    return { x: cx, y: low + (top - low) * (1 - (1 - u) ** 2), frame: flap, show: true, danger: true }
  }
  if (c.kind === 'fish') {
    const f = ((time / FISH.period + c.phase) % 1) * FISH.period, surface = c.ty * TILE + 5
    if (f < FISH.wait) return { x: cx, y: surface + 8, frame: 'jump', show: false, danger: false, warn: f > FISH.wait - FISH.warn }
    const u = Math.min(1, (f - FISH.wait) / FISH.air), hgt = FISH.height * TILE
    if (u >= 1) return { x: cx, y: surface + 8, frame: 'fall', show: false, danger: false }
    return { x: cx, y: surface + 4 - hgt * 4 * u * (1 - u), frame: u < 0.5 ? 'jump' : 'fall', show: true, danger: true }
  }
  // 蛇: 床の端から端まで、同じ速さで往復する
  const len = Math.max(1, c.x1 - c.x0), d = ((time * SNAKE.speed + c.phase * len * 2) % (len * 2)), right = d < len
  return { x: right ? c.x0 + d : c.x1 - (d - len), y: (c.ty + 1) * TILE - 3, frame: Math.floor(time * 6) % 2 ? 'crawl1' : 'crawl2', show: true, danger: true, dir: right ? 1 : -1 }
}
// 町の人の今の姿: { x, y（足もと）, dir, frame（0・1） }。行き来して、端で少し立ち止まる
export function folkAt(f, time) {
  const len = Math.max(1, f.x1 - f.x0), stop = 1.2, walk = len / f.speed, period = (walk + stop) * 2
  let k = ((time / period + f.phase) % 1) * period
  const foot = (f.ty + 1) * TILE
  if (k < walk) return { x: f.x0 + k * f.speed, y: foot, dir: 1, frame: Math.floor(time * 4 + f.index) % 2 }
  k -= walk
  if (k < stop) return { x: f.x1, y: foot, dir: 1, frame: 0 }
  k -= stop
  if (k < walk) return { x: f.x1 - k * f.speed, y: foot, dir: -1, frame: Math.floor(time * 4 + f.index) % 2 }
  return { x: f.x0, y: foot, dir: -1, frame: 0 }
}
// 供養の人の今の姿: { show, x, y, dir, kneel, food（供養の食べ物が置かれている）, wish（言葉を出す） }
//   OFFER_PERIOD 秒ごと: 遠い方の端から歩いて来る → ひざまずいて置く（OFFER_KNEEL 秒） → 戻って去る。食べ物は置いてから OFFER_SHOW 秒で消える
export function offeringAt(room, time) {
  const P = { OFFER_PERIOD, OFFER_SHOW, OFFER_WALK, OFFER_KNEEL }
  const o = room.offer
  if (!o) return { show: false, food: false }
  const k = ((time / P.OFFER_PERIOD + o.phase) % 1) * P.OFFER_PERIOD
  const dist = Math.abs(room.seat.x - o.from), walk = dist / P.OFFER_WALK, toward = Math.sign(room.seat.x - o.from) || 1
  const y = room.seat.y, food = k >= walk + P.OFFER_KNEEL && k < walk + P.OFFER_KNEEL + P.OFFER_SHOW
  if (k < walk) return { show: true, x: o.from + toward * k * P.OFFER_WALK, y, dir: toward, kneel: false, food, frame: Math.floor(k * 4) % 2 }
  if (k < walk + P.OFFER_KNEEL) return { show: true, x: room.seat.x - toward * 10, y, dir: toward, kneel: true, food, wish: true }
  const back = k - walk - P.OFFER_KNEEL
  if (back < walk + 0.5) return { show: true, x: room.seat.x - toward * 10 - toward * back * P.OFFER_WALK, y, dir: -toward, kneel: false, food, wish: back < 1.2, frame: Math.floor(back * 4) % 2 }
  return { show: false, food }
}

const CREATURE_BOX = { bird: [5, 4], fish: [5, 5], snake: [6, 3] }   // 当たりの半分の幅・高さ

// 当たり: 体の四角（左・上・右・下）が、死ぬものに触れているか
// 針のタイル k（左上が x, y）に、体が当たったか（overlap は箱の重なりを調べる関数）
const spikeHits = (k, x, y, overlap) =>
  (k === K.spikeUp && overlap(x + 2, y + 6, x + 14, y + 16)) ||
  (k === K.spikeDown && overlap(x + 2, y, x + 14, y + 12)) ||
  (k === K.spikeRight && overlap(x, y + 2, x + 10, y + 14)) ||
  (k === K.spikeLeft && overlap(x + 6, y + 2, x + 16, y + 14))

// 体が当たった針のタイル { k, tx, ty }（なければ null）。死んだ所の花を、その針の根もとの面から咲かせるため
export function spikeAt(world, box) {
  const tx0 = Math.floor(box.l / TILE), tx1 = Math.floor((box.r - 0.01) / TILE)
  const ty0 = Math.floor(box.t / TILE), ty1 = Math.floor((box.b - 0.01) / TILE)
  const overlap = (l, t, r, b) => box.l < r && box.r > l && box.t < b && box.b > t
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const k = tileAt(world, tx, ty)
    if (spikeHits(k, tx * TILE, ty * TILE, overlap)) return { k, tx, ty }
  }
  return null
}

// time: 世界の時計（噴き出す炎）。ctime: 生き物ごとの時計（c → 秒。部屋に入った時から数える。無ければ time）
export function deadly(world, box, time, ctime) {
  const tx0 = Math.floor(box.l / TILE), tx1 = Math.floor((box.r - 0.01) / TILE)
  const ty0 = Math.floor(box.t / TILE), ty1 = Math.floor((box.b - 0.01) / TILE)
  const overlap = (l, t, r, b) => box.l < r && box.r > l && box.t < b && box.b > t
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const k = tileAt(world, tx, ty), x = tx * TILE, y = ty * TILE
    if (k === K.fire && overlap(x, y + 5, x + 16, y + 16)) return 'fire'
    // 針の当たり（2026-11-05 に Pixel の針の絵〈tiles/spikes。根もとから先まで 14 ドット、針が密に並ぶのは根もとから 9 ドットほど〉に合わせた）:
    //   根もとから 10 ドット（天井の針は 12。体の当たりは頭の側が 3 ドット低いので、そろえて体が 8 ドット以内に入ると死ぬ）、横は端を 2 ドットずつ空ける。先の細い 4 ドットは当たらない（かすっただけでは死なない救済）
    if (spikeHits(k, x, y, overlap)) return 'spike'
  }
  for (const c of world.creatures || []) {
    const s = creatureAt(c, ctime ? ctime(c) : time)
    if (!s.danger) continue
    const [hw, hh] = CREATURE_BOX[c.kind]
    if (overlap(s.x - hw, s.y - hh, s.x + hw, s.y + hh)) return c.kind
  }
  for (const j of world.jets) {
    if (jetState(j, time) !== 'on') continue
    const x = j.x * TILE, y = j.y * TILE
    if (overlap(x + 3, y - JET.height * TILE, x + 13, y)) return 'jet'
  }
  return null
}

// 体が触れているすり抜けの通路（なければ -1）
export function hiddenTouched(world, box) {
  const tx0 = Math.floor(box.l / TILE), tx1 = Math.floor((box.r - 0.01) / TILE)
  const ty0 = Math.floor(box.t / TILE), ty1 = Math.floor((box.b - 0.01) / TILE)
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) continue
    const i = ty * world.w + tx
    if (world.t[i] === K.hidden) return world.hiddenOf[i]
  }
  return -1
}

export const roomAt = (world, px, py) => {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE)
  if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return null
  const ri = world.roomOf[ty * world.w + tx]
  return ri >= 0 ? world.rooms[ri] : null
}

// 死んだ所の真下の地面（花が咲く所）
export function groundBelow(world, x, y) {
  const tx = Math.floor(x / TILE)
  for (let ty = Math.max(0, Math.floor((y - 4) / TILE)); ty < world.h; ty++) {
    const k = tileAt(world, tx, ty)
    if (isSolidKind(k)) return ty * TILE
    if (k === K.fire) return ty * TILE + 7
    if (k === K.spikeUp) return ty * TILE + 12
  }
  return y
}
