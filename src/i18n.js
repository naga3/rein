// 言葉（日本語と英語）。画面に出る文はここにまとめる
// 言語: URL の ?lang=ja・?lang=en があればそれ（覚えておく）、覚えたものがあればそれ、なければブラウザの言語の一覧に日本語があれば日本語、なければ英語
const KEY = 'reincarnation-lang'
function pick() {
  try {
    const q = new URLSearchParams(globalThis.location?.search || '').get('lang')
    if (q === 'ja' || q === 'en') { globalThis.localStorage?.setItem(KEY, q); return q }
    const saved = globalThis.localStorage?.getItem(KEY)
    if (saved === 'ja' || saved === 'en') return saved
    const langs = globalThis.navigator?.languages || [globalThis.navigator?.language || 'ja']
    return langs.some((l) => /^ja\b/i.test(l)) ? 'ja' : 'en'
  } catch { return 'ja' }
}
export const LANG = pick()

const TEXT = {
  ja: {
    life: (n) => `第${n}生`,
    found: '心が、静まった',
    deadLight: '光は、消えない',
    deadNext: 'Z：つぎの生へ', deadNextTouch: 'ボタン：つぎの生へ',
    deadEscape: '光に、包まれた',
    escapeNote: 'この道を抜けた（この先の道は、まだ無い）',
    toRealm: (r) => `次の生は、${{ animal: '畜生', peta: '餓鬼', human: '人', deva: '天', human2: '人' }[r] ?? r}の道に`,
    heard: '法を、聞いた',
    rejoice: '善きかな',
    gave: '施した',
    bliss: (n, m) => `花 ${n} / ${m}`,   // 天の右上: 拾った花 / 天女がまいた花（2026-11-10。本人の頼み。最高は記録の画面に）
    mindLost: '念を、失った',
    savor: ['おいしい', 'いい香り', 'きれい', 'あまい', 'ほめられた'],
    freed: '渇愛が、尽きた',
    endTitle: '輪廻を、終えた', endBack: 'Z：タイトルへ', endBackTouch: 'タップでタイトルへ',
    endLives: (n) => `生まれ変わり ${n} 回`,
    endFlowers: (n) => `咲いた花 ${n} 輪`,
    blessing: '満ちた川が、海を満たすように',
    offerWish: '親族に、届きますように',
    sariputtaWish: '前の世の母に、届きますように',
    wipe: '記録を消す（Delete）',
    wipeAsk: '花と生の数を消して、第1生からやり直しますか？',
    editor: 'ステージエディタ',
    padOk: '決定', padClose: '閉じる', back: '戻る',
    start: 'はじめる', cont: 'つづける', recall: '回想', wander: '道をめぐる', wanderSigns: (a, b) => `看板 ${a}/${b}`, wanderLights: (a, b) => `光 ${a}/${b}`, recordsMenu: '記録', langMenu: '言葉: 日本語', backHint: 'ボタンか Esc で戻る',
    devRealm: '始める道', devRealmSaved: '記録どおり', devRoom: '画面へ', devRoomPick: '（選ぶと飛ぶ）',
    realmHell: '地獄', realmAnimal: '畜生', realmPeta: '餓鬼', realmHuman: '人', realmDeva: '天', realmLast: '人', recSigns: '読んだ看板', signsMenu: '看板', helpMenu: '操作', helpClose: 'ボタンか Esc で閉じる', helpCloseTouch: 'タップで閉じる',
    helpPc: ['←→：走る', 'Z・Shift：ダッシュ', '　方向キーで8方向', '　空中でも1回ダッシュ可能', '↓：看板を読む', '　X：原典を開く', 'M：音を消す', 'Esc：ポーズ（死ぬ・タイトルへ）', 'ゲームパッドも使える'],
    helpTouch: ['左側：スティック（走る・ダッシュの向き）', '右側：ダッシュ（押している間続く）', '　スティックを倒さなければ上へ', '　地面から 1 回と空中で 1 回', 'スティックを下：看板を読む', '看板の窓の「原典を開く」をタップ'], signsCount: (n, m) => `読んだ看板 ${n} / ${m}`, signsHint: '方向キー：選ぶ　Z：開く　Esc：戻る', signsHintTouch: 'タップで選ぶ、もう一度で開く', signsUnread: 'まだ読んでいない看板', signsNone: 'まだ読んだ看板はない', signsLast: '再び人', signKeys: 'Z・クリック：閉じる　X：', signKeysTouch: 'タップ：閉じる　', signLink: '原典を開く',
    recHell: '地獄の光の部屋', recAnimal: '畜生の光の部屋', recPeta: '餓鬼の光の部屋', recHuman: '人の光の部屋', recDeva: '天で拾った花', recLives: '生まれ変わり', recFlowers: '咲いた花',
    padDash: 'ダッシュ',
    wipeShort: '記録を消す', debugShort: 'デバッグ', pauseShort: 'ポーズ', pauseHead: 'ポーズ', pauseResume: 'つづける', pauseDie: 'この生を終える', pauseTitle: 'タイトルへ', pauseHint: '↑↓：選ぶ　Z：決める　Esc：つづける', pauseHintTouch: 'タップで選ぶ', debugClose: '閉じる', focusHint: '画面をクリックすると、キーで遊べます',
    complete: '看板・光の部屋を全部',
    freeLoop: '渇愛を尽きさせる',
    pick: '場所をコピー（C）', pickShort: '場所をコピー', pickHint: 'クリック：1 マス　なぞる：範囲　Esc：やめる', pickHintTouch: 'なぞると範囲　離すとコピー', copied: 'コピーした', fly: '飛ぶ（F）', flyShort: '飛ぶ', flying: '飛ぶ：入（F で切る）', flyingTouch: '飛ぶ：入',
  },
  en: {
    life: (n) => `Life ${n}`,
    found: 'The mind grew still',
    deadLight: 'The light remains',
    deadNext: 'Z: next life', deadNextTouch: 'Button: next life',
    deadEscape: 'Wrapped in light',
    escapeNote: 'Out of this realm (the road beyond is not made yet)',
    toRealm: (r) => `The next life: ${{ animal: 'the animal realm', peta: 'the realm of ghosts', human: 'the human realm', deva: 'the heavens', human2: 'the human realm' }[r] ?? r}`,
    heard: 'Heard the Dhamma',
    rejoice: 'Sadhu',
    gave: 'Alms given',
    bliss: (n, m) => `Flowers ${n} / ${m}`,
    mindLost: 'Mindfulness lost',
    savor: ['Delicious', 'Sweet scent', 'Beautiful', 'So sweet', 'Praised'],
    freed: 'Craving has ended',
    endTitle: 'The round of rebirth is over', endBack: 'Z: back to title', endBackTouch: 'Tap to return to title',
    endLives: (n) => `Rebirths: ${n}`,
    endFlowers: (n) => `Flowers: ${n}`,
    blessing: 'As full rivers fill the ocean',
    offerWish: 'May this reach our kin',
    sariputtaWish: 'May this reach my mother of a past life',
    wipe: 'Erase record (Delete)',
    wipeAsk: 'Erase the flowers and the life count, and start again from Life 1?',
    editor: 'Stage editor',
    padOk: 'OK', padClose: 'CLOSE', back: 'Back',
    start: 'Start', cont: 'Continue', recall: 'Look back', wander: 'Walk the realms', wanderSigns: (a, b) => `Signs ${a}/${b}`, wanderLights: (a, b) => `Light ${a}/${b}`, recordsMenu: 'Records', langMenu: 'Language: English', backHint: 'Any button / Esc: back',
    devRealm: 'Start in', devRealmSaved: 'As saved', devRoom: 'Go to', devRoomPick: '(pick to jump)',
    realmHell: 'Hell', realmAnimal: 'Animals', realmPeta: 'Ghosts', realmHuman: 'Humans', realmDeva: 'Heaven', realmLast: 'Humans', recSigns: 'Signs read', signsMenu: 'Signs', helpMenu: 'Controls', helpClose: 'Any button / Esc: close', helpCloseTouch: 'Tap to close',
    helpPc: ['<- ->: run', 'Z / Shift: dash', '  8 directions with the arrow keys', '  one more dash in the air', 'Down: read a sign', '  X: open the source', 'M: mute', 'Esc: pause (die, title)', 'Gamepads work too'],
    helpTouch: ['Left side: stick (run, dash direction)', 'Right side: dash (lasts while held)', '  stick untouched: dash up', '  once from the ground, once in the air', 'Stick down: read a sign', 'Tap "open the source" in the sign window'], signsCount: (n, m) => `Signs read ${n} / ${m}`, signsHint: 'Arrows: choose   Z: open   Esc: back', signsHintTouch: 'Tap to choose, tap again to open', signsUnread: 'Not read yet', signsNone: 'No signs read yet', signsLast: 'Human Again', signKeys: 'Z / click: close   X: ', signKeysTouch: 'Tap: close   ', signLink: 'open the source',
    recHell: 'Rooms of light (hell)', recAnimal: 'Rooms of light (animals)', recPeta: 'Rooms of light (ghosts)', recHuman: 'Rooms of light (humans)', recDeva: 'Flowers in heaven', recLives: 'Rebirths', recFlowers: 'Flowers bloomed',
    padDash: 'DASH',
    wipeShort: 'Erase record', debugShort: 'Debug', pauseShort: 'Pause', pauseHead: 'Pause', pauseResume: 'Continue', pauseDie: 'End this life', pauseTitle: 'Back to title', pauseHint: 'Up/Down: choose   Z: select   Esc: continue', pauseHintTouch: 'Tap to choose', debugClose: 'Close', focusHint: 'Click the screen to play with the keys',
    complete: 'Complete signs & lights',
    freeLoop: 'End craving',
    pick: 'Copy place (C)', pickShort: 'Copy place', pickHint: 'Click: one tile  Drag: area  Esc: cancel', pickHintTouch: 'Drag for an area, lift to copy', copied: 'Copied', fly: 'Fly (F)', flyShort: 'Fly', flying: 'Fly: ON (F to stop)', flyingTouch: 'Fly: ON',
  },
}
// 経典の場所の名前（地図の place は日本語で書く。英語はここで引く。ゲームのフォントに無い字〈ṇ など〉は使わない）

// 部屋の名前（右上に出す。日本語は地図の名前のまま）
const ROOMS_EN = {
  大地獄の口: 'Mouth of the Great Hell', 光の部屋: 'Room of Light', 針の床: 'Floor of Needles', 熱灰の淵: 'Pit of Hot Ashes', 針の縦穴: 'Needle Shaft', 剣の葉の崖: 'Sword-Leaf Cliff',
  棘の林: 'The Simbali Grove', ヴェータラニー川: 'The River Vetarani', 剣の葉の林: 'The Sword-Leaf Forest', 針の抜け道: 'Needle Passage', 熱灰の原: 'Plain of Hot Ashes',
  四方の門: 'The Four Gates', 奥の炎: 'The Inner Flames', 高い吹き抜け: 'High Shaft',
  池のほとり: 'Pondside', 葦の原: 'Reed Field', 法を聞く所: 'Where the Dhamma Is Heard', 倒木の淵: 'Fallen-Log Pool', 蛇の小径: 'Snake Path', 鷺の木: 'Heron Tree',
  沼の上: 'Over the Marsh', 茨の藪: 'Bramble Thicket', 蛍の谷: 'Firefly Valley', 大樹の根: 'Roots of the Great Tree', ガッガラー池: 'Gaggara Pond', ガッガラー池のほとり: 'Shore of Gaggara Pond',
  町はずれ: 'Edge of Town', 供養の場: 'Place of Offering', 市場の通り: 'Market Street', 井戸の広場: 'Well Square', 宴の跡: 'After the Feast', 血の川の渡し: 'Blood River Crossing',
  門前: 'Before the Gate', 屋根の上: 'On the Rooftops', 裏路地: 'Back Alley', 墓地: 'Cemetery', サーリプッタの道: "Sariputta's Road", サーリプッタの供養の場: "Sariputta's Offering",
  川辺の村: 'Riverside Village', 渡し瀬: 'The Ford', 段々の田: 'Terraced Paddies', 坂の村: 'Hillside Village', 竹林の崖: 'Bamboo Cliff', 霊鷲山: 'Vulture Peak',
  歓喜園の空: 'Sky over the Garden of Joy', 自分の生の跡: 'Traces of My Lives', 静けさ: 'Stillness',
  何もない部屋: 'Empty Room', 炎の下: 'Beneath the Flames', 水下: 'Under the Water', 涅槃へ向かう: 'Toward Nibbana', 深い穴: 'The Deep Pit',
  賑わう町: 'Bustling Town', 施しの家の前: "Before the Giver's House", 物干しの屋根: 'Rooftops of Drying Cloth', 川への坂: 'Slope to the River', 渡し場: 'Ferry Landing',
  川沿いの市: 'Riverside Market', 乾いた川床: 'Dry Riverbed', 熱風の辻: 'Crossroads of Hot Wind', 陽炎の通り: 'Street of Heat Haze', 焼けた路地: 'Scorched Alley',
  戸口の通り: 'Street of Doorways', 四方の辻: 'Four-Way Crossing', 夜の市: 'Night Market', 火葬場: 'Cremation Ground', 墓地の門: 'Cemetery Gate', 夜明けの道: 'Road at Dawn',
}
export const roomName = (ja) => (LANG === 'en' ? ROOMS_EN[ja] ?? ja : ja)

export const tr = TEXT[LANG]
