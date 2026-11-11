import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { formatMap } from './tools/mapfile.mjs'
import { execFile } from 'node:child_process'

// ステージエディタ（editor.html）の読み書き: GET・POST /__map/<名前> で src/maps/<名前>.json
const mapFiles = () => ({
  name: 'map-files',
  configureServer(server) {
    // 地図のファイルが変わったら、エディタに知らせる（エディタは地図を import していないので、ここで伝える）
    server.watcher.add(path.resolve('src/maps'))
    server.watcher.on('change', (f) => {
      const m = f.match(/[\\/]src[\\/]maps[\\/]([a-z0-9-]+)\.json$/)
      if (m) server.ws.send({ type: 'custom', event: 'map-changed', data: { name: m[1] } })
      // 文や場所の名前が変わったら、ゲームのフォント（src/font.js。使う字だけ）を作り直す。中身が同じなら書かない
      if (/[\\/]src[\\/]/.test(f) && !/font\.js$/.test(f)) execFile('node', ['tools/font.mjs'], () => {})
    })
    // 看板の文（src/signs.json）の読み書き: GET・POST /__signs（ステージエディタの看板の窓）
    server.middlewares.use('/__signs', (req, res) => {
      const file = path.resolve('src/signs.json')
      if (req.method === 'GET') { res.setHeader('content-type', 'application/json'); return res.end(fs.readFileSync(file)) }
      if (req.method === 'POST') {
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          try {
            const data = JSON.parse(body)
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('看板の表ではない')
            fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
            res.end('ok')
          } catch (e) { res.statusCode = 400; res.end(String(e.message)) }
        })
        return
      }
      res.statusCode = 405; res.end()
    })
    server.middlewares.use('/__map/', (req, res) => {
      const name = decodeURIComponent(req.url.replace(/^\//, '').split('?')[0])
      if (!/^[a-z0-9-]+$/.test(name)) { res.statusCode = 400; return res.end('bad name') }
      const file = path.resolve('src/maps', `${name}.json`)
      if (req.method === 'GET') {
        if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('not found') }
        res.setHeader('content-type', 'application/json')
        return res.end(fs.readFileSync(file))
      }
      if (req.method === 'POST') {
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          try {
            const data = JSON.parse(body)
            if (!Array.isArray(data.rooms)) throw new Error('rooms が無い')
            fs.writeFileSync(file, formatMap(data))
            res.end('ok')
          } catch (e) { res.statusCode = 400; res.end(String(e.message)) }
        })
        return
      }
      res.statusCode = 405; res.end()
    })
  },
})

// ポートは ~/src/etc/PORTS.md の区画から 15040
// Tailscale（*.ts.net）からも開けるように（スマホで遊ぶとき。gunzo と同じ）
export default defineConfig({ base: './', plugins: [mapFiles()], server: { port: 15040, strictPort: true, allowedHosts: ['.ts.net'] }, preview: { port: 15040, strictPort: true, allowedHosts: ['.ts.net'] }, clearScreen: false })
