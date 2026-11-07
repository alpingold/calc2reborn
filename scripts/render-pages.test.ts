// @vitest-environment node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { buildPdf, stream } from './test-pdf'

const TSX = path.resolve('node_modules/.bin/tsx')
const SCRIPT = path.resolve('scripts/render-pages.ts')

const CATALOG = '<< /Type /Catalog /Pages 2 0 R >>'
const ONE_PAGE = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
const PAGE = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>'
const INK = stream('0 g 100 100 200 50 re f')

const pdfs: Record<string, Uint8Array | string> = {
  good: buildPdf([CATALOG, ONE_PAGE, PAGE, INK]),
  blank: buildPdf([CATALOG, ONE_PAGE, PAGE, stream('')]),
  // page 2 is not a page, so asking for it throws
  throwing: buildPdf([CATALOG, '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>', PAGE, INK, '42']),
  unopenable: 'this is not a PDF',
}

// left by an earlier run, in each exam's page folder
const STALE = ['p1.png', 'p2.png', 'p9.png', 'p9.failed.png', 'notes.txt']

let cwd: string
let run: ReturnType<typeof spawnSync>

function pagesOf(exam: string): string[] {
  return fs.readdirSync(path.join(cwd, 'raw/pages', exam)).sort()
}

function contentOf(exam: string, file: string): string {
  return fs.readFileSync(path.join(cwd, 'raw/pages', exam, file)).toString('latin1')
}

beforeAll(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'render-pages-'))
  fs.mkdirSync(path.join(cwd, 'raw/exams'), { recursive: true })
  for (const [exam, pdf] of Object.entries(pdfs)) {
    fs.writeFileSync(path.join(cwd, 'raw/exams', `${exam}.pdf`), pdf)
    fs.mkdirSync(path.join(cwd, 'raw/pages', exam), { recursive: true })
    for (const stale of STALE) fs.writeFileSync(path.join(cwd, 'raw/pages', exam, stale), 'stale')
  }
  run = spawnSync(TSX, [SCRIPT], { cwd, encoding: 'utf8' })
}, 60_000)

afterAll(() => {
  fs.rmSync(cwd, { recursive: true, force: true })
})

test('exits 1 and names each PDF that failed', () => {
  expect(run.status).toBe(1)
  expect(run.stderr).toMatch(/unopenable: could not open/)
  expect(run.stderr).toMatch(/blank p1: looks blank/)
  expect(run.stderr).toMatch(/throwing p2: render threw/)
  expect(run.stderr).not.toMatch(/\bgood\b/)
})

test('an unopenable PDF leaves no page behind, good or failed', () => {
  expect(pagesOf('unopenable')).toEqual(['notes.txt'])
})

test('a page that fails its check is kept only as p<N>.failed.png', () => {
  expect(pagesOf('blank')).toEqual(['notes.txt', 'p1.failed.png'])
})

test('a page whose render throws leaves no file for that page', () => {
  expect(pagesOf('throwing')).not.toContain('p2.png')
  expect(pagesOf('throwing')).not.toContain('p2.failed.png')
})

test('pages beyond the page count are removed and a passing page is rewritten', () => {
  expect(pagesOf('good')).toEqual(['notes.txt', 'p1.png'])
  expect(contentOf('good', 'p1.png')).not.toBe('stale')
})
