import fs from 'node:fs'
import path from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'

interface Crop {
  figure: string
  examId: string
  page: number
  x: number
  y: number
  w: number
  h: number
}

const crops: Crop[] = JSON.parse(
  fs.readFileSync(new URL('./crops.json', import.meta.url), 'utf8'),
)
for (const c of crops) {
  const src = path.resolve('raw/pages', c.examId, `p${c.page}.png`)
  const img = await loadImage(src)
  const canvas = createCanvas(c.w, c.h)
  canvas.getContext('2d').drawImage(img, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h)
  const out = path.resolve('public', c.figure)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, canvas.toBuffer('image/png'))
  console.log(`${c.figure} <- ${c.examId} p${c.page}`)
}
console.log(`Cropped ${crops.length} figures`)
