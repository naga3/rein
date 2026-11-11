// 背景の白いかすみ（半透明の白）を、背景を描き終えてから重ねるための入れ物（2026-11-09）
//   餓鬼・人の道の背景は、二つの部屋の景色が並ぶとき、景色を一つずつ描いて列ごとに切り貼りする（town.js・village.js）。
//   描くたびに本当の半透明の層（tint）へ重ねると、あとから描いた景色の点がそれを消してしまい、境目を越える間だけ濃く見えた。
//   そこで、景色を描く間は、かすみの濃さをここに覚えておき（点を描けば、その下のかすみは消える）、切り貼りのあとで一度に重ねる
import { P } from '../palette.js'
import { W, H } from './base.js'

export function makeHaze(rawPx, rawTint) {
  const a = new Float32Array(W * H)
  // 背景を描く間に使う px と tint（tint は白だけ）
  const px = (x, y, c) => { rawPx(x, y, c); if (x >= 0 && y >= 0 && x < W && y < H) a[y * W + x] = 0 }
  const tint = (x, y, c, k) => { if (x >= 0 && y >= 0 && x < W && y < H) { const o = y * W + x; a[o] = k + a[o] * (1 - k) } }
  return {
    px, tint, a,
    reset: () => a.fill(0),
    // 覚えたかすみを、本当の半透明の層へ重ねる
    apply: () => { if (rawTint) for (let o = 0; o < W * H; o++) if (a[o] > 0) rawTint(o % W, (o / W) | 0, P.white, a[o]) },
  }
}
