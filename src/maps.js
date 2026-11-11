// 道ごとの地図（src/maps/*.json。ステージエディタで描く）
import hell from './maps/hell.json' with { type: 'json' }
import animal from './maps/animal.json' with { type: 'json' }
import peta from './maps/peta.json' with { type: 'json' }
import human from './maps/human.json' with { type: 'json' }
import deva from './maps/deva.json' with { type: 'json' }
import last from './maps/last.json' with { type: 'json' }

export const MAPS = { hell: hell.rooms, animal: animal.rooms, peta: peta.rooms, human: human.rooms, deva: deva.rooms, human2: last.rooms }

// 地図のファイルが書き換えられたら（ステージエディタで保存したときなど）、このページ（ゲーム）だけ読み直す。
//   受け止めないと、開発サーバーが開いている全部のページに「読み直せ」を送り、エディタまで読み直されて最初の画面に戻っていた（2026-11-05）
import.meta.hot?.accept(['./maps/hell.json', './maps/animal.json', './maps/peta.json', './maps/human.json', './maps/deva.json', './maps/last.json'], () => location.reload())
