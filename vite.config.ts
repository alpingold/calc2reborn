/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'

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

export default defineConfig({
  plugins: [react(), rawPages],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    globals: false,
  },
})
