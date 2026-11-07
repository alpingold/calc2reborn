import { createRequire } from 'node:module'
import path from 'node:path'

/** A pixel counts as ink below this luma. Failed scan layers leave pale smudges well above it. */
const DARK_LUMA = 128

/**
 * Below this share of dark pixels a page looks blank. Across the 840 pages in the archive, rendered
 * correctly, the lightest holds 0.09% (a 48 character page) and the darkest 6.3%. With the mask layer
 * missing, the f2022-e3 scans held at most 0.02%. These are measured at full resolution: thin text reads
 * as nearly empty once downscaled.
 */
const MIN_DARK_FRACTION = 0.0005
const MAX_DARK_FRACTION = 0.5

/** Genuine pages never fall under 29 dark pixels per character at 2x, so 10 means the text was not painted. */
const MIN_DARK_PER_CHAR = 10
const MIN_CHARS_FOR_TEXT_CHECK = 20

/** Harmless on any PDF. Anything not allowed here or below fails the run. */
const BENIGN_WARNINGS = [/^TT: undefined function: \d+$/] // TrueType hinting instructions, unused at this scale

/**
 * Harmless only on these PDFs, each compared with a second renderer page by page. Elsewhere the same
 * warning could mean a truncated JPEG, which the ink check alone might not catch.
 */
const BENIGN_WARNINGS_BY_PDF = new Map([
  ['f2022-e3', [/^decodeScan - unexpected MCU data, current marker is: ffff$/]], // 0xFF fill bytes in its JPEG layers
])

/** `pdf` is the page folder name: the exam id, plus .ans or .sol for those files. */
export function classifyWarning(message: string, pdf: string): 'benign' | 'failure' {
  const benign = [...BENIGN_WARNINGS, ...(BENIGN_WARNINGS_BY_PDF.get(pdf) ?? [])]
  return benign.some((pattern) => pattern.test(message)) ? 'benign' : 'failure'
}

export function tallyWarnings(messages: string[]): { message: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const message of messages) counts.set(message, (counts.get(message) ?? 0) + 1)
  return [...counts].map(([message, count]) => ({ message, count }))
}

/** Dark pixels in RGBA data, compositing any transparency over the white page. */
export function countDarkPixels(rgba: ArrayLike<number>): number {
  let dark = 0
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3] / 255
    const luma = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
    if (luma * alpha + 255 * (1 - alpha) < DARK_LUMA) dark++
  }
  return dark
}

export interface PageEvidence {
  /** The page folder name, as for classifyWarning. */
  pdf: string
  width: number
  height: number
  darkPixels: number
  /** Non-space characters in the page's text layer. */
  textChars: number
  warnings: string[]
}

/** What is wrong with a rendered page; an empty list means it is usable. */
export function assessPage({ pdf, width, height, darkPixels, textChars, warnings }: PageEvidence): string[] {
  const problems: string[] = []
  const fraction = darkPixels / (width * height)
  const percent = `${(100 * fraction).toFixed(3)}% dark`
  if (fraction < MIN_DARK_FRACTION) problems.push(`looks blank: ${percent}`)
  if (fraction > MAX_DARK_FRACTION) problems.push(`mostly black: ${percent}`)
  if (textChars >= MIN_CHARS_FOR_TEXT_CHECK && darkPixels / textChars < MIN_DARK_PER_CHAR) {
    problems.push(`too little ink for ${textChars} characters in the text layer: ${darkPixels} dark pixels`)
  }
  for (const { message, count } of tallyWarnings(warnings)) {
    if (classifyWarning(message, pdf) === 'failure') problems.push(`PDF.js: ${message}${count > 1 ? ` (x${count})` : ''}`)
  }
  return problems
}

/**
 * Where PDF.js finds its decoders and data files. It has no default in Node. Without `wasmUrl` it cannot
 * decode JBIG2, CCITT, or JPX images at all, and the render still resolves with those images left out.
 */
export function pdfjsResourceOptions(): Record<string, string> {
  const root = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
  return {
    wasmUrl: `${root}/wasm/`,
    standardFontDataUrl: `${root}/standard_fonts/`,
    cMapUrl: `${root}/cmaps/`,
    iccUrl: `${root}/iccs/`,
  }
}
