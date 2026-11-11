// 餓鬼の道の布施人（2026-11-07。動きは game.js の stepDonors、決まりの値は world.js の DONOR）
//   絵は供養の人（Pixel の peta/offerer: walk1・walk2・kneel、あれば stand）。気づいたときは「!」、不安で立ち止まったときは「…」、見失ったときは「?」を頭の上に出す。
//   光の部屋でひざまずくと、座る所に供養の食べ物が置かれ、回向の言葉を出す
import { P } from '../palette.js'
import { DONOR } from '../world.js'
import { tr } from '../i18n.js'

export function makeDonor({ px, artPic, artBlit, text, textW }) {
  const W = 320
  const drawDonors = (S, camX, camY) => {
    for (const b of S.donors || []) {
      const x = Math.round(b.x - camX), y = Math.round(b.y - camY)
      if (x < -20 || x > W + 20) continue
      // 光の部屋: 座る所に食べ物（ひざまずいてから）
      if (b.st === 'offer' && b.kneel) {
        const seat = b.offerAt ?? S.world.rooms[b.room].seat, food = artPic('peta/food', 'offering')   // 座る所まで行けなかったときは、目の前（offerAt）に
        if (food && S.time - b.kneel > 0.3) artBlit(food, Math.round(seat.x - camX) - 8, Math.round(seat.y - camY) - food.rows.length, false)
      }
      const moving = Math.abs(b.vx) > 1
      const ref = b.d.sariputta ? 'peta/sariputta' : 'peta/offerer'   // サーリプッタ（最後の光の部屋。餓鬼事 2.2）
      const name = b.kneel ? 'kneel' : moving ? `walk${(Math.floor(S.time * 6) % 2) + 1}` : artPic(ref, 'stand') ? 'stand' : 'walk1'   // 立ち止まる絵（stand）が無ければ、歩く 1 コマ目
      const pic = artPic(ref, name)
      if (pic) artBlit(pic, x - 8, y - pic.rows.length, b.dir < 0)
      const top = y - (pic?.rows.length ?? 24) - 4
      const mark = b.st === 'notice' ? '!' : b.st === 'lost' ? '?' : b.st === 'uneasy' ? '…' : null   // 不安（見失う手前）は「…」
      if (mark) text(x - (textW(mark) >> 1), top - 10, mark, P.ye3, P.ink)
      if (b.kneel && S.time - b.kneel > 0.3 && S.time - b.kneel < DONOR.kneel + 2.5) {
        const msg = b.d.sariputta ? tr.sariputtaWish : tr.offerWish
        text(Math.max(2, Math.min(W - textW(msg) - 2, x - (textW(msg) >> 1))), top - 12, msg, P.white, P.ink)
      }
    }
  }
  return { drawDonors }
}
