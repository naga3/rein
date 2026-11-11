// 道（趣）ごとの違い。地獄 → 畜生 → 餓鬼 → 人 → 天の順に一つずつ進む（中部 12 の五趣の順）
//   map: 地図（src/maps/<map>.json）  next: 次の道（地図が無ければ「この先の道はまだ無い」）
//   light: 光の部屋の見つけ方（approach: 座る者に近づく、listen: 説く声の届く所で動かずに聞く、offering: 供養の食べ物に触れる、alms: 托鉢の僧に食べ物を渡す、rain: 天女のまく花を拾う）
//   player・tiles: 絵（art の名前。無ければ地獄の絵を色を替えて使う）  wisps: 歩くと鬼火が出る
//   no: 道の番号（2026-11-08）。光の部屋は「道の番号-光の部屋の番号」で指す（3-5 なら餓鬼の道の 5 番の光の部屋。地図の部屋の no）
export const REALMS = {
  hell: { no: 1, map: 'hell', next: 'animal', light: 'approach', player: 'player/player', tiles: 'tiles/rock', wisps: true },
  animal: { no: 2, map: 'animal', next: 'peta', light: 'listen', player: 'animal/frog', tiles: 'tiles/earth', wisps: false },
  peta: { no: 3, map: 'peta', next: 'human', light: 'offering', player: 'peta/peta', tiles: 'tiles/town', wisps: false },
  human: { no: 4, map: 'human', next: 'deva', light: 'alms', player: 'human/human', tiles: 'tiles/village', wisps: false, folkLook: true },   // folkLook: 町の人が近くで立ち止まってこちらを見る（game.js の stepFolk）
  // 天: ボーナスステージ。一画面。天女がまく花を拾う。花が降り終わると、念を失って天の身から落ちる（長部 1）
  //   sky: 天だけの手触り（死なない、ふわりと軽い、ダッシュをいつでも使える、空中は飛ぶ姿）。ほかの道では使わない
  deva: { no: 5, map: 'deva', next: 'human2', light: 'rain', player: 'deva/deva', tiles: 'tiles/cloud', wisps: false, sky: true },
  // 再び人（人パート 2）: 自分の人生の跡が色を失ってつながる一本の道。誘うもの（地図の T）に触れると味わえるが、道は気づかないうちに最初へ戻る（無限ループ）。
  //   oneWay: 一本道で、後ろへは戻れない（画面の左の端が壁。再び人だけ）。一周まるごと一度も触れずに歩き通すと、輪が切れて解脱（相応部 56.11、15.1、法句経 154）。sections: 道を五つに分けた区切りの、それぞれの道の景色
  human2: { no: 6, map: 'last', bgm: 'last', oneWay: true, next: null, light: 'loop', player: 'human/human', tiles: 'tiles/cloud', wisps: false, sections: ['hell', 'animal', 'peta', 'human', 'deva'] },
}
export const FIRST_REALM = 'hell'
// 開発中（npm run dev）だけ: タイトルの「はじめる・つづける」で、記録に関わらずこの道から（作っている道を早く試すため）。公開版には効かない
//   画面の下のデバッグの並びの「始める道」で選ぶ（ブラウザに覚える。2026-11-07。前は DEV_START_REALM をここに書き、タイトルに「道を選ぶ」があった）。
//   空なら記録どおり。まだ選んでいなければ地獄
export const DEV_REALM_KEY = 'reincarnation-dev-realm'
export function devStartRealm() { try { const v = localStorage.getItem(DEV_REALM_KEY); return v == null ? 'hell' : v || null } catch { return null } }
export const ESCAPE = 5   // 光の部屋（にあたるもの）をこれだけ見つけて死ぬと、次の生は次の道
// 畜生（謎解き）: 説く者からこの距離（ドット）の中で、動かずに待つ。はじめの LISTEN_WAIT 秒は何も起きず、そのあと LISTEN_FILL 秒で光が満ちて見つける。
//   動いたり離れたりすると、最初から
export const LISTEN_RANGE = 48, LISTEN_WAIT = 4, LISTEN_FILL = 2   // LISTEN_WAIT: 2026-11-06 に 5 → 4 秒
// 餓鬼: 供養の食べ物は OFFER_PERIOD 秒ごとに、生きている人が歩いて来て置き、OFFER_SHOW 秒で消える（触れると見つける）
export const OFFER_PERIOD = 30, OFFER_SHOW = 4, OFFER_WALK = 34, OFFER_KNEEL = 0.8
// 天: 天女がまく花の数と、まき終えるまで（秒）。浮遊感（重力・落ちる速さ・落ちるときの重さの倍率）
export const RAIN_TOTAL = 100, RAIN_TIME = 90
export const ENDING_BACK = 10   // 解脱の終わりの画面で、「Z：タイトルへ」の案内を出し、戻れるようになるまで（秒。2026-11-10 に本人の頼みで、曲の終わり〈22 秒〉から 10 秒に早めた）
export const RAIN_RIPEN = 0.9   // まかれてから拾えるようになるまで（秒。その間は点滅する。天女にくっついていても取れないように）
export const FLOAT = { gravity: 0.3, maxFall: 0.28, fallMul: 0.6 }
// 光の部屋の呼び名「道の番号-光の部屋の番号」（3-5 など）
export const lightLabel = (realm, no) => `${REALMS[realm]?.no ?? '?'}-${no ?? '?'}`
