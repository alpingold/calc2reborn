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

const GOOD_PAGE = /^p\d+\.png$/
const ANY_PAGE = /^p\d+(\.failed)?\.png$/

function removePages(outDir: string, pattern: RegExp): void {
  for (const name of fs.readdirSync(outDir)) {
    if (pattern.test(name)) fs.rmSync(path.join(outDir, name))
  }
}

/** Renders one page and checks it. A page that fails is kept only as p<N>.failed.png. */
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
    pdf: label,
  })
  for (const problem of problems) fail(`${label} p${n}`, problem)
  fs.writeFileSync(path.join(outDir, problems.length ? `p${n}.failed.png` : `p${n}.png`), canvas.toBuffer('image/png'))
  page.cleanup()
  return pageWarnings
}

/**
 * Clears the folder first, so that afterwards a p<N>.png exists only if this run rendered it and it passed.
 * A PNG left by an earlier run may be a broken one, or from a PDF that has since changed.
 */
async function renderPdf(file: string, label: string, outDir: string): Promise<number> {
  fs.mkdirSync(outDir, { recursive: true })
  removePages(outDir, ANY_PAGE)
  const seen: string[] = []
  let numPages = 0
  let task: pdfjs.PDFDocumentLoadingTask | undefined
  try {
    task = pdfjs.getDocument({
      data: new Uint8Array(fs.readFileSync(path.join(examsDir, file))),
      ...pdfjsResourceOptions(),
    })
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
    await task?.destroy()
  }
  for (const { message, count } of tallyWarnings(takeWarnings())) {
    seen.push(message)
    if (classifyWarning(message, label) === 'failure') {
      // it arrived after the pages were checked and could belong to any of them
      fail(label, `PDF.js: ${message} (x${count})`)
      removePages(outDir, GOOD_PAGE)
    }
  }
  console.log(`${label}: ${numPages} pages`)
  for (const { message, count } of tallyWarnings(seen.filter((m) => classifyWarning(m, label) === 'benign'))) {
    console.log(`  PDF.js warning, known harmless: ${message} (x${count})`)
  }
  return numPages
}

const files = fs.existsSync(examsDir) ? fs.readdirSync(examsDir).sort() : []
// an exam id asked for by name but with no downloaded PDF is a mistake, not an empty success
for (const id of wanted) {
  if (!files.some((f) => f.startsWith(id + '.'))) failures.push(`No downloaded PDF for exam ${id} in ${examsDir}`)
}
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
