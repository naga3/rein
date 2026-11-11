// 地図のファイル（src/maps/*.json）の書き方。部屋の一行を一行に書いて、差分を読みやすくする
export function formatMap(data) {
  const rooms = data.rooms.map((r) => {
    const { rows, ...head } = r
    const h = JSON.stringify(head).slice(1, -1)
    return `    {${h}, "rows": [\n` + rows.map((s) => `      ${JSON.stringify(s)}`).join(',\n') + '\n    ]}'
  })
  return '{\n  "rooms": [\n' + rooms.join(',\n') + '\n  ]\n}\n'
}
