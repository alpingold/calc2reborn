import fs from 'node:fs'
import path from 'node:path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'

const examsDir = path.resolve('raw/exams')
const wanted = process.argv.slice(2)
const suffixes = [
  { ext: '.pdf', sub: '' },
  { ext: '.ans.pdf', sub: '.ans' },
  { ext: '.sol.pdf', sub: '.sol' },
]

const files = fs.existsSync(examsDir) ? fs.readdirSync(examsDir).sort() : []
let rendered = 0
let skipped = 0
for (const file of files) {
  // longest suffix first so ".ans.pdf" is not read as exam id "x.ans"
  const s = [...suffixes].reverse().find((x) => file.endsWith(x.ext))
  if (!s) continue
  const examId = file.slice(0, -s.ext.length)
  if (wanted.length && !wanted.includes(examId)) continue
  const outDir = path.resolve('raw/pages', examId + s.sub)
  fs.mkdirSync(outDir, { recursive: true })
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(path.join(examsDir, file))),
  }).promise
  let r = 0
  let k = 0
  for (let n = 1; n <= doc.numPages; n++) {
    const out = path.join(outDir, `p${n}.png`)
    if (fs.existsSync(out)) {
      k++
      continue
    }
    const page = await doc.getPage(n)
    const vp = page.getViewport({ scale: 2 })
    const canvas = createCanvas(vp.width, vp.height)
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx as any, viewport: vp, canvas: canvas as any }).promise
    fs.writeFileSync(out, canvas.toBuffer('image/png'))
    r++
  }
  rendered += r
  skipped += k
  console.log(`${examId + s.sub}: ${doc.numPages} pages (${r} rendered, ${k} skipped)`)
}
console.log(`Total: ${rendered} rendered, ${skipped} skipped`)
