import fs from 'node:fs'
import path from 'node:path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'
import { assessPage, classifyWarning, countDarkPixels, pdfjsResourceOptions, tallyWarnings } from './render-check'

const examsDir = path.resolve('raw/exams')
const wanted = process.argv.slice(2)
const suffixes = [
  { ext: '.pdf', sub: '' },
  { ext: '.ans.pdf', sub: '.ans' },
  { ext: '.sol.pdf', sub: '.sol' },
]

// PDF.js reports a failed image or font only through console.warn, and the render still resolves.
const PDFJS_WARNING = 'Warning: '
const consoleWarn = console.warn
let warnings: string[] = []
console.warn = (...args: unknown[]) => {
  const text = args.join(' ')
  if (text.startsWith(PDFJS_WARNING)) warnings.push(text.slice(PDFJS_WARNING.length))
  else consoleWarn(...args)
}
function takeWarnings(): string[] {
  const taken = warnings
  warnings = []
  return taken
}

const failures: string[] = []
function fail(where: string, problem: string): void {
  failures.push(`${where}: ${problem}`)
  console.error(`RENDER FAILED ${where}: ${problem}`)
}

/**
 * Renders one page and checks it. A page that fails is kept only as p<N>.failed.png, so nothing can read
 * it as a good p<N>.png. Pages are always re-rendered: a PNG left by an earlier run may be a broken one.
 */
async function renderPage(doc: pdfjs.PDFDocumentProxy, n: number, label: string, outDir: string): Promise<string[]> {
  const page = await doc.getPage(n)
  const viewport = page.getViewport({ scale: 2 })
  const canvas = createCanvas(viewport.width, viewport.height)
  const context = canvas.getContext('2d')
  await page.render({ canvasContext: context as any, viewport, canvas: canvas as any }).promise
  const text = await page.getTextContent()
  const textChars = text.items.reduce((sum, item) => sum + ('str' in item ? item.str.replace(/\s/g, '').length : 0), 0)
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  const pageWarnings = takeWarnings()
  const problems = assessPage({
    width: canvas.width,
    height: canvas.height,
    darkPixels: countDarkPixels(data),
    textChars,
    warnings: pageWarnings,
  })
  for (const problem of problems) fail(`${label} p${n}`, problem)
  const good = path.join(outDir, `p${n}.png`)
  const failed = path.join(outDir, `p${n}.failed.png`)
  fs.rmSync(problems.length ? good : failed, { force: true })
  fs.writeFileSync(problems.length ? failed : good, canvas.toBuffer('image/png'))
  page.cleanup()
  return pageWarnings
}

async function renderPdf(file: string, label: string, outDir: string): Promise<number> {
  fs.mkdirSync(outDir, { recursive: true })
  const task = pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(path.join(examsDir, file))),
    ...pdfjsResourceOptions(),
  })
  const seen: string[] = []
  let numPages = 0
  try {
    const doc = await task.promise
    numPages = doc.numPages
    for (let n = 1; n <= numPages; n++) {
      try {
        seen.push(...(await renderPage(doc, n, label, outDir)))
      } catch (e) {
        fail(`${label} p${n}`, `render threw: ${e}`)
      }
    }
  } catch (e) {
    fail(label, `could not open: ${e}`)
  } finally {
    await task.destroy()
  }
  for (const { message, count } of tallyWarnings(takeWarnings())) {
    seen.push(message)
    if (classifyWarning(message) === 'failure') fail(label, `PDF.js: ${message} (x${count})`)
  }
  console.log(`${label}: ${numPages} pages`)
  for (const { message, count } of tallyWarnings(seen.filter((m) => classifyWarning(m) === 'benign'))) {
    console.log(`  PDF.js warning, known harmless: ${message} (x${count})`)
  }
  return numPages
}

const files = fs.existsSync(examsDir) ? fs.readdirSync(examsDir).sort() : []
let rendered = 0
for (const file of files) {
  // longest suffix first so ".ans.pdf" is not read as exam id "x.ans"
  const s = [...suffixes].reverse().find((x) => file.endsWith(x.ext))
  if (!s) continue
  const examId = file.slice(0, -s.ext.length)
  if (wanted.length && !wanted.includes(examId)) continue
  rendered += await renderPdf(file, examId + s.sub, path.resolve('raw/pages', examId + s.sub))
}
console.log(`Total: ${rendered} pages`)
if (failures.length) {
  console.error(`\n${'='.repeat(72)}\n${failures.length} RENDER PROBLEMS. DO NOT TRANSCRIBE THESE PAGES.\n${'='.repeat(72)}`)
  for (const failure of failures) console.error(failure)
  process.exitCode = 1
}
