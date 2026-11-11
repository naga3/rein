// 暗くする色: 色の表（palette.js）の各色に、少し暗い色を足す（ゲームの中だけ。art/gunzo.gpl には入れない）
// 番号 i（0〜N-1）の暗い色は N + i。敵の範囲攻撃の予兆（地面を暗くする丸）に使う。暗い色をもう一度暗くしても、そのまま
import { PAL_HEX } from './palette.js'

export const BASE_N = PAL_HEX.length
export const DARKEN = 0.62
const dim = (h) => [0, 2, 4].map((k) => Math.round(parseInt(h.slice(k, k + 2), 16) * DARKEN).toString(16).padStart(2, '0')).join('')
export const ALL_HEX = [...PAL_HEX, ...PAL_HEX.map(dim)]   // 表示（main.js・tools/png.mjs・tools/video.mjs）はこれを使う
export const dark = (i) => (i < BASE_N ? i + BASE_N : i)
