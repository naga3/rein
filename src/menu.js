// タイトルとメニュー（2026-11-06 に main.js から分けた）: タイトル・記録・看板の一覧・操作の窓・道を選ぶ（開発中だけ）
//   mode: title | records | signs | help | play。上下で選び、ボタン（Z・Shift・Space）か Enter で決める。Esc で戻る。指で項目に触れても決まる
//   遊んでいる間に Esc でタイトルへ（記録は残る。「つづける」で戻れる）
//   看板の窓（ゲームの中と、看板の一覧から開くもの）: X で原典を開く。ボタン・Enter・Esc で閉じる。窓の下の「原典を開く」をクリック・タップで原典、ほかの所は閉じる
import { createGame, SIGN_CLOSE } from './game.js'
import { MAPS } from './maps.js'
import { W, H } from './render.js'
import { tr, LANG } from './i18n.js'
import { REALMS, devStartRealm, RAIN_TOTAL, ENDING_BACK } from './realms.js'
import { DEBUG } from './debug.js'
import { createTitle } from './title.js'
import { WALKERS } from './titlewalk.js'
import { signCount, signsInOrder, signOrder, openSignPage, SIGNS, placedSigns } from './signs.js'

// fb: 色の番号の画面、renderer: ゲームを描くもの（看板の窓を借りる）、game: { get(), set(S) } 今のゲーム、hasSave: 記録があるか
export function createMenu({ fb, renderer, game, hasSave, sfx = () => {} }) {
  const title = createTitle(fb, W, H)
  let mode = 'title', sel = 0, hits = [], tapAt = null, prevX = 0, prevY = 0, enter = false, esc = false
  const S = () => game.get()
  const REALM_NAMES = { hell: tr.realmHell, animal: tr.realmAnimal, peta: tr.realmPeta, human: tr.realmHuman, deva: tr.realmDeva, human2: tr.realmLast }
  // タイトルの花畑を歩く主人公: 記録のある道（たどり着いた道）と今の道。地獄はいつも
  const reached = () => WALKERS.filter((r) => r === 'hell' || S().records[r] || S().realm === r)
  const flowerCount = () => Object.values(S().records).reduce((n, d) => n + d.flowers.length, 0)
  const titleItems = () => [
    S().liberated ? { id: 'wander', label: tr.wander } : { id: 'play', label: hasSave() ? tr.cont : tr.start },   // 解脱したあとは「道をめぐる」（2026-11-07。前は「回想」で見るだけだった）
    { id: 'records', label: tr.recordsMenu },
    { id: 'signs', label: tr.signsMenu },
    { id: 'help', label: tr.helpMenu },
    { id: 'lang', label: tr.langMenu },
    { id: 'wipe', label: tr.wipeShort },
  ]
  // 道をめぐる（解脱したあと）: 道の一覧。読んだ看板の数と、見つけた光の部屋の数を横に（光の部屋の無い道は看板だけ）
  const wanderItems = () => [...Object.keys(REALMS).filter((r) => MAPS[r]).map((r) => {
    const placed = placedSigns(MAPS[r]), read = placed.filter((id) => S().signsRead.has(id)).length, lights = MAPS[r].filter((q) => q.light).length
    const parts = [placed.length ? tr.wanderSigns(read, placed.length) : '', lights ? tr.wanderLights(S().foundCount(r), lights) : ''].filter(Boolean)
    return { id: r, label: r === 'human2' ? tr.signsLast : REALM_NAMES[r] ?? r, value: parts.join('　') }
  }), { id: 'back', label: tr.back }]
  // 記録: 道ごとに見つけた数（地図の光の部屋の数のうち）
  const recordRows = () => {
    const lights = (r) => (MAPS[r] || []).filter((q) => q.light).length
    const found = (r) => S().foundCount(r)
    return [
      { label: tr.recHell, value: `${found('hell')} / ${lights('hell')}` },
      { label: tr.recAnimal, value: `${found('animal')} / ${lights('animal')}` },
      { label: tr.recPeta, value: `${found('peta')} / ${lights('peta')}` },
      { label: tr.recHuman, value: `${found('human')} / ${lights('human')}` },
      { label: tr.recDeva, value: `${S().records.deva?.rainBest ?? 0} / ${RAIN_TOTAL}` },   // ハイスコア / まかれる花の数
      { label: tr.recSigns, value: `${S().signsRead.size} / ${signCount(MAPS)}` },
      { label: tr.recLives, value: `${S().lifeNo - 1}` },   // 生まれ変わった回数（最初の生は数えない。2026-11-11）
    ]
  }

  // 看板の一覧（タイトルの「看板」）: 道ごとに、地図に置いた看板を、はじまりからの道のりが近い順に（隠し看板も数に入れる。signs.js の signOrder）。
  //   読んだ看板は出典、まだのものは「？？？」。読んだ看板を開くと看板の窓
  let signTab = 0, signSel = 0, reading = null
  //   一つも読んでいない道は、名前も出さない（まだ行っていない道の名前が見えてしまうので。2026-11-10）
  const signTabs = () => Object.keys(REALMS).filter((r) => MAPS[r] && signsInOrder(MAPS[r]).some((id) => S().signsRead.has(id))).map((r) => ({ key: r, label: r === 'human2' ? tr.signsLast : REALM_NAMES[r] ?? r }))
  const signItems = () => { const tb = signTabs()[signTab]; return tb ? signOrder(MAPS, tb.key).map((id) => { const read = S().signsRead.has(id), L = SIGNS[id]?.[LANG] || SIGNS[id]?.ja; return { id, read, label: read ? L?.source ?? id : '？？？', lines: read ? L?.lines ?? [] : [] } }) : [] }
  const canDecide = () => reading && reading.close == null && reading.t > 0.2
  // ゲームの中の看板の窓で、原典を開く
  const decideGameSign = () => { const s = S(); if (mode === 'play' && s.canDecide?.()) openSignPage(s.reading.id, LANG) }

  // 操作の説明（タイトルの「操作」）: タイトルの上に窓で出す。PC とスマホで、それぞれの操作だけ。どのボタン・Esc・タップでも閉じる
  let helpT = 0

  // ポーズ（2026-11-11。本人の頼み）: 遊んでいる間に Esc・スマホの板の「ポーズ」・パッドの Select / Start で開く。ゲームは止まる（曲は流れたまま）。
  //   つづける・この生を終える（前の R キー。その場で死ぬ）・タイトルへ（記録は残り、「つづける」で戻る）。Esc でつづける
  const pauseItems = () => [{ id: 'resume', label: tr.pauseResume }, { id: 'die', label: tr.pauseDie }, { id: 'toTitle', label: tr.pauseTitle }]
  const pause = () => { if (mode === 'play' && !S().ending && !S().reading) { mode = 'pause'; sel = 0; prevY = 0 } }
  function choose(id) {
    if (mode === 'pause') {
      if (id === 'resume') mode = 'play'
      else if (id === 'die') { mode = 'play'; if (!S().dead) S().die('self') }
      else if (id === 'toTitle') { mode = 'title'; sel = 0 }
      return
    }
    if (mode === 'title') {
      if (id === 'play') {
        // 開発中: 画面の下の「始める道」で選んだ道から（realms.js の devStartRealm）。その道にいなければ、その道のはじめから
        const dev = DEBUG ? devStartRealm() : null
        if (dev && MAPS[dev] && S().realm !== dev && !S().liberated) game.set(createGame({ maps: MAPS, startRealm: dev }))
        mode = 'play'; if (!S().liberated) S().banner = { text: tr.life(S().lifeNo), t: 0, big: true } }
      else if (id === 'records') { mode = 'records'; sel = -1 }
      else if (id === 'signs') { mode = 'signs'; signTab = 0; signSel = 0; reading = null }
      else if (id === 'help') { mode = 'help'; helpT = 0 }
      else if (id === 'lang') { try { localStorage.setItem('reincarnation-lang', LANG === 'ja' ? 'en' : 'ja') } catch {} location.reload() }
      else if (id === 'wipe') { if (confirm(tr.wipeAsk)) S().reset() }
      else if (id === 'wander') { mode = 'wander'; sel = 0 }
    } else if (mode === 'wander') {
      // 選んだ道のはじめから。生の数は増えず、花は記録に入らず、次の道へは移らない（game.js の wander）
      game.set(createGame({ maps: MAPS, startRealm: id, wander: true })); mode = 'play'
      S().banner = { text: id === 'human2' ? tr.signsLast : REALM_NAMES[id] ?? id, t: 0, big: true }
    }
  }
  function stepSigns(inp) {
    const x = inp.x, left = x < 0 && prevX >= 0, right = x > 0 && prevX <= 0
    const y = inp.y, down = inp.downPressed || (y > 0 && prevY <= 0), up = inp.upPressed || (y < 0 && prevY >= 0)
    prevX = x; prevY = y
    // 決定はボタン（Z・Shift・Space・Enter・パッド・スマホの右側）。原典を開くのは X キー・クリック・タップだけ（Enter で開いていたら、続けて押すと窓が開いてすぐ原典まで開いていた）
    const press = inp.okPressed || inp.dashPressed || enter
    if (reading) {   // 窓の中: ボタンで閉じる（原典を開くのは onKey と onClick）
      if (press && canDecide()) reading.close = 0
      tapAt = null; enter = false; esc = false; return
    }
    // 格子（4 列）の中を上下左右で動く。左の端でさらに左・右の端でさらに右を押すと、隣の道へ
    const tabs = signTabs(), items = signItems(), C = 4
    const open = (i) => { if (items[i]?.read) { reading = { id: items[i].id, t: 0, close: null, first: false }; sfx('sign') } }   // 窓が開く音は、ゲーム中と同じ
    const toTab = (d) => { if (tabs.length > 1) { signTab = (signTab + d + tabs.length) % tabs.length; signSel = 0 } }
    if (left) { if (signSel % C === 0) toTab(-1); else signSel-- }
    if (right) { if (signSel % C === C - 1 || signSel === items.length - 1) toTab(1); else signSel++ }
    if (down && signSel + C < items.length) signSel += C
    if (up && signSel - C >= 0) signSel -= C
    if (tapAt) {
      const inBox = ([a, b, l, r]) => tapAt.y >= a && tapAt.y <= b && tapAt.x >= l && tapAt.x <= r
      const ti = (hits.tabs || []).findIndex(inBox), hit = (hits.items || []).find(inBox)
      tapAt = null
      if (ti >= 0) { signTab = ti; signSel = 0 }
      else if (hit) { if (signSel === hit[4]) open(hit[4]); else signSel = hit[4] }   // 一度目のタップで選び（右に説明）、もう一度で開く
    } else if (press) open(signSel)
    else if (esc) { mode = 'title'; sel = 2 }
    enter = false; esc = false
  }
  // メニューの一コマ（遊んでいない間）
  // カーソルが動いたら効果音（2026-11-07。タイトル・看板の一覧など、メニューのどこでも。画面が替わったときは鳴らさない）
  const cursorAt = () => `${mode}:${sel}:${signTab}:${signSel}`
  function step(inp, dt) {
    const before = cursorAt(), beforeMode = mode
    stepInner(inp, dt)
    if (mode === beforeMode && mode !== 'play' && cursorAt() !== before) sfx('cursor')
  }
  function stepInner(inp, dt) {
    if (mode === 'help') helpT += dt
    if (reading) { reading.t += dt; if (reading.close != null && (reading.close += dt) >= SIGN_CLOSE) reading = null }
    // 解脱の終わりの画面: 曲が終わったころ（ENDING_BACK 秒）から、Z・タップでタイトルへ戻れる（2026-11-10。本人の頼み。前は Esc だけだった）
    if (mode === 'play' && S().ending) { if (S().ending.t >= ENDING_BACK && (inp.okPressed || inp.dashPressed || tapAt)) { mode = 'title'; sel = 0 } tapAt = null; return }
    if (mode === 'play') return
    if (mode === 'signs') { stepSigns(inp); return }
    if (mode === 'help') { if (helpT > 0.2 && (inp.okPressed || inp.dashPressed || enter || esc || tapAt)) { mode = 'title'; sel = 3 } tapAt = null; enter = false; esc = false; return }
    const items = mode === 'title' ? titleItems() : mode === 'wander' ? wanderItems() : mode === 'pause' ? pauseItems() : []
    // 上下: キーは押した瞬間（素早く押しても取りこぼさない）、スティックは倒した瞬間
    const y = inp.y, down = inp.downPressed || (y > 0 && prevY <= 0), up = inp.upPressed || (y < 0 && prevY >= 0)
    prevY = y
    if (items.length) {
      if (down) sel = (sel + 1) % items.length
      if (up) sel = (sel + items.length - 1) % items.length
      if (sel < 0) sel = 0
    }
    if (tapAt) {
      const i = hits.findIndex(([a, b, l = -Infinity, r = Infinity]) => tapAt.y >= a && tapAt.y <= b && tapAt.x >= l && tapAt.x <= r)
      tapAt = null
      if (mode === 'records') { mode = 'title'; sel = 1 }
      else if (i >= 0 && items[i]?.id === 'back') { mode = 'title'; sel = 0 }
      else if (i >= 0 && items[i]) { sel = i; choose(items[i].id) }
    } else if (inp.okPressed || inp.dashPressed || enter) {
      // 決定（ダッシュ・Space・Enter）。記録の画面では、どのボタンでも戻る。道を選ぶの一覧は「戻る」を選ぶと戻る
      if (mode === 'records') { mode = 'title'; sel = 1 }
      else if (items[sel]?.id === 'back') { mode = 'title'; sel = 0 }
      else if (items[sel]) choose(items[sel].id)
    } else if (esc) {
      if (mode === 'pause') mode = 'play'
      else if (mode !== 'title') { mode = 'title'; sel = 0 }
    }
    enter = false; esc = false
  }
  function draw(t) {
    const s = S()
    if (mode === 'title') hits = title.drawTitle(t, flowerCount(), titleItems(), sel, reached())
    else if (mode === 'help') { hits = title.drawTitle(t, flowerCount(), titleItems(), sel, reached()); title.drawPopup(t, tr.helpMenu, s.touchUi ? tr.helpTouch : tr.helpPc, s.touchUi ? tr.helpCloseTouch : tr.helpClose) }
    else if (mode === 'signs') {
      const tabs = signTabs(), items = signItems(), read = items.filter((i) => i.read).length
      hits = title.drawSigns(t, flowerCount(), tr.signsMenu, tabs, signTab, items, signSel, tabs.length ? tr.signsCount(read, items.length) : tr.signsNone, s.touchUi ? tr.signsHintTouch : tr.signsHint, tr.signsUnread)
      if (reading) renderer.drawSignWindow({ reading, touchUi: s.touchUi }, t)
    }
    else if (mode === 'pause') { renderer.draw(S(), t); hits = title.drawPause(t, tr.pauseHead, pauseItems(), sel, S().touchUi ? tr.pauseHintTouch : tr.pauseHint) }   // 止まったゲームの上に、ポーズの窓
    else if (mode === 'wander') hits = title.drawList(t, flowerCount(), tr.wander, wanderItems(), tr.backHint, sel)
    else hits = title.drawList(t, flowerCount(), tr.recordsMenu, recordRows(), tr.backHint)
  }
  // キー（keydown）: 看板の窓の X・Enter・Esc、メニューの Enter・Esc、遊んでいる間の Esc（ポーズ。解脱の終わりの画面ではタイトルへ）
  function onKey(e) {
    const s = S()
    if (mode === 'signs' && reading) {   // 看板の一覧から開いた窓
      if ((e.key === 'x' || e.key === 'X') && !e.repeat && canDecide()) openSignPage(reading.id, LANG)
      if (e.key === 'Enter') enter = true
      if (e.key === 'Escape' && reading.close == null) reading.close = 0
      return
    }
    if (mode === 'play' && s.reading) {   // ゲームの中の看板の窓（タイトルへは戻らない）
      if ((e.key === 'x' || e.key === 'X') && !e.repeat) decideGameSign()
      if (e.key === 'Enter' || e.key === 'Escape') s.closeReading()
      return
    }
    if (e.key === 'Enter') enter = true
    if (e.key === 'Escape') { if (mode === 'play') { if (s.ending) { mode = 'title'; sel = 0 } else pause() } else esc = true }
  }
  // クリック・タップ（click。スマホのブラウザは、指が触れた瞬間をまだ「人の操作」と認めずタブを開かせないので、離した瞬間に）:
  //   看板の窓の「原典を開く」の上なら原典を開き、ほかの所なら窓を閉じる。x, y は画面のドット
  function onClick(x, y) {
    const s = S()
    if (mode === 'play' && s.reading) { if (renderer.onSignLink(x, y)) decideGameSign(); else s.closeReading() }
    else if (mode === 'signs' && canDecide()) { if (renderer.onSignLink(x, y)) openSignPage(reading.id, LANG); else reading.close = 0 }
  }
  // 指・マウスが触れた所（pointerdown。メニューの項目を選ぶ）
  function onPointerDown(x, y) { if (mode !== 'play' || S().ending) tapAt = { x, y } }
  return {
    get mode() { return mode }, set mode(m) { mode = m },
    step, draw, onKey, onClick, onPointerDown, pause,
    windowOpen: () => !!reading,   // 看板の一覧から開いた窓が出ているか（スマホの右側のボタンの字を「閉じる」に）
  }
}
