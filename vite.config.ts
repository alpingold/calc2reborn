/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { handleSync, memoryStorage } from './api/_core.js'

// Dev only: serve raw/pages at /raw-pages so source page images are visible without committing them.
const RAW_PAGES = path.resolve('raw/pages')
const rawPages: Plugin = {
  name: 'raw-pages',
  configureServer(server) {
    server.middlewares.use('/raw-pages', (req, res) => {
      const rel = decodeURIComponent((req.url ?? '/').split('?')[0])
      const file = path.resolve(RAW_PAGES, '.' + rel)
      if (!file.startsWith(RAW_PAGES + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
        res.statusCode = 404
        res.end('Not found')
        return
      }
      res.setHeader('Content-Type', 'image/png')
      createReadStream(file).pipe(res)
    })
  },
}

// Dev only: the sync endpoint with the same rules as production, kept in memory until the server stops.
const devSync: Plugin = {
  name: 'dev-sync',
  configureServer(server) {
    const storage = memoryStorage()
    server.middlewares.use('/api/sync', (req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        let body: unknown
        try {
          body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined
        } catch {
          body = undefined
        }
        void handleSync({ method: req.method, key: String(req.headers['x-sync-key'] ?? ''), body, ip: 'dev' }, storage).then((out) => {
          res.statusCode = out.status
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(out.json))
        })
      })
    })
  },
}

export default defineConfig({
  plugins: [react(), rawPages, devSync],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    globals: false,
  },
})
