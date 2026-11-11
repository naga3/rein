// 描画の共通の土台: 画面の大きさと、どの描画のファイルからも使う小さな道具
import { ALL_HEX } from '../shade.js'
import { REALMS } from '../realms.js'

export const W = 320
export const H = 240

export const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// 色の表の RGB（半透明の計算と、光の層で使う）
export const RGB = ALL_HEX.map((h) => [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)))

// 道ごとの設定（REALMS）。world が無ければ地獄
export const realmOf = (world) => REALMS[world?.realm ?? 'hell'] || REALMS.hell

// 濃さを 4 段に刻む市松（level 0〜4。大きいほど濃い）
export const dither = (x, y, level) => level >= 4 || (level === 3 && (x + y) % 2 === 0) || (level === 2 && x % 2 === 0 && y % 2 === 0) || (level === 1 && x % 4 === 0 && y % 2 === 0 && (x + y) % 4 === 0)

// 足もとの点（bx, by: 根もとの 1 ドット）を中心に、上へ伸びる絵を dir の向きへ回す。面の側の点（ax, ay: 根もとのドットが来る所）
export const turnAround = (dir, bx, by, ax, ay) => {
  if (dir === 'down') return (x, y) => [ax - (x - bx), ay - (y - by)]
  if (dir === 'right') return (x, y) => [ax - (y - by), ay + (x - bx)]
  if (dir === 'left') return (x, y) => [ax + (y - by), ay - (x - bx)]
  return null
}
