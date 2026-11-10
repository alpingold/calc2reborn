// @vitest-environment node
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'
import { assessPage, classifyWarning, countDarkPixels, pdfjsResourceOptions, tallyWarnings } from './render-check'
import { buildPdf, stream } from './test-pdf'

const DECODE_SCAN_FF = 'decodeScan - unexpected MCU data, current marker is: ffff'
const WIDTH = 1224
const HEIGHT = 1584

function rgba(pixels: [number, number, number, number][]): Uint8Array {
  return new Uint8Array(pixels.flat())
}

describe('countDarkPixels', () => {
  test('counts a single black pixel at full resolution', () => {
    const data = new Uint8Array(4 * 100).fill(255)
    data.set([0, 0, 0, 255], 40)
    expect(countDarkPixels(data)).toBe(1)
  })

  test('ignores white and the faint grey smudges a failed layer leaves behind', () => {
    expect(countDarkPixels(rgba([[255, 255, 255, 255], [240, 240, 240, 255], [200, 200, 200, 255]]))).toBe(0)
  })

  test('counts dark grey as ink', () => {
    expect(countDarkPixels(rgba([[90, 90, 90, 255]]))).toBe(1)
  })

  test('treats a transparent pixel as the white page beneath it', () => {
    expect(countDarkPixels(rgba([[0, 0, 0, 0]]))).toBe(0)
  })
})

describe('assessPage', () => {
  const page = { pdf: 'f2025-e1', width: WIDTH, height: HEIGHT, textChars: 0, warnings: [] as string[] }

  test('passes the lightest genuine page in the archive: a 48 character page', () => {
    expect(assessPage({ ...page, textChars: 48, darkPixels: 1737 })).toEqual([])
  })

  test('passes the lightest genuine scanned page in the archive', () => {
    expect(assessPage({ ...page, darkPixels: 5305 })).toEqual([])
  })

  test('flags the stray glyphs left on a scan whose mask failed', () => {
    expect(assessPage({ ...page, darkPixels: 133 })[0]).toMatch(/looks blank/)
  })

  test('flags an entirely white page', () => {
    expect(assessPage({ ...page, darkPixels: 0 })[0]).toMatch(/looks blank/)
  })

  test('flags a page with too little ink for its text layer', () => {
    expect(assessPage({ ...page, textChars: 2000, darkPixels: 4000 })[0]).toMatch(/2000 characters/)
  })

  test('does not apply the text comparison to a short text layer', () => {
    expect(assessPage({ ...page, textChars: 5, darkPixels: 1000 })).toEqual([])
  })

  test('flags a page flooded with black, as an inverted mask would be', () => {
    expect(assessPage({ ...page, darkPixels: WIDTH * HEIGHT })[0]).toMatch(/mostly black/)
  })

  test('flags a failing warning even when the ink looks fine', () => {
    const warnings = ['Unable to decode image "img_p1_2": "Jbig2Error: JBig2 failed to initialize".']
    expect(assessPage({ ...page, darkPixels: 50000, warnings })[0]).toMatch(/Jbig2Error/)
  })

  test('accepts a warning known to be harmless', () => {
    expect(assessPage({ ...page, darkPixels: 50000, warnings: ['TT: undefined function: 32'] })).toEqual([])
  })

  test('judges a warning by the PDF the page belongs to', () => {
    const warnings = [DECODE_SCAN_FF]
    expect(assessPage({ ...page, pdf: 'f2022-e3', darkPixels: 50000, warnings })).toEqual([])
    expect(assessPage({ ...page, pdf: 'f2023-final', darkPixels: 50000, warnings })[0]).toMatch(/decodeScan/)
  })
})

describe('classifyWarning', () => {
  test('TrueType hinting warnings are harmless on any PDF', () => {
    expect(classifyWarning('TT: undefined function: 32', 'f2025-e1.ans')).toBe('benign')
  })

  test('JPEG fill bytes are harmless on f2022-e3, the one PDF checked against a second renderer', () => {
    expect(classifyWarning(DECODE_SCAN_FF, 'f2022-e3')).toBe('benign')
  })

  test.each(['f2023-final', 'f2022-e3.ans', 'f2022-e3.sol', 'x-f2022-e3'])('JPEG fill bytes fail on %s', (pdf) => {
    expect(classifyWarning(DECODE_SCAN_FF, pdf)).toBe('failure')
  })

  test('any other JPEG marker fails, even on f2022-e3', () => {
    expect(classifyWarning('decodeScan - unexpected MCU data, current marker is: ffd9', 'f2022-e3')).toBe('failure')
  })

  test.each([
    'Unable to decode image "img_p0_1": "Jbig2Error: JBig2 failed to initialize".',
    "Dependent image isn't ready yet",
    '#getWasmInstance: UnknownErrorException: Ensure that the `wasmUrl` API parameter is provided.',
    'UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.',
    'something PDF.js may say in a later version',
  ])('failure: %s', (message) => {
    expect(classifyWarning(message, 'f2022-e3')).toBe('failure')
  })
})

test('tallyWarnings folds repeats, keeping order of first appearance', () => {
  expect(tallyWarnings(['b', 'a', 'b', 'b'])).toEqual([
    { message: 'b', count: 3 },
    { message: 'a', count: 1 },
  ])
})

/**
 * One page holding one 8 x 8 CCITT G4 image. Each row of all-white is the single code bit 1, and
 * BlackIs1 makes those white pixels the samples 0, so a working decoder paints a solid black square and
 * a missing one leaves the page white. PDF.js decodes CCITT and JBIG2 with the same WebAssembly module.
 */
function ccittPdf(): Uint8Array {
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R /Resources << /XObject << /I 5 0 R >> >> >>',
    stream('q 100 0 0 100 0 0 cm /I Do Q'),
    stream(
      String.fromCharCode(0xff, 0xff),
      '/Type /XObject /Subtype /Image /Width 8 /Height 8 /BitsPerComponent 1 /ColorSpace /DeviceGray /Filter /CCITTFaxDecode /DecodeParms << /K -1 /Columns 8 /Rows 8 /BlackIs1 true >>',
    ),
  ])
}

describe('pdfjsResourceOptions', () => {
  test('gives PDF.js directories it can read, each with the trailing slash it demands', () => {
    const options = Object.entries(pdfjsResourceOptions())
    expect(options.map(([name]) => name).sort()).toEqual(['cMapUrl', 'iccUrl', 'standardFontDataUrl', 'wasmUrl'])
    for (const [name, url] of options) {
      expect(url, name).toMatch(/\/$/)
      expect(fs.existsSync(url), `${name}: ${url}`).toBe(true)
    }
  })

  test('lets PDF.js decode a CCITT image in Node', async () => {
    const task = pdfjs.getDocument({ data: ccittPdf(), ...pdfjsResourceOptions() })
    const doc = await task.promise
    const page = await doc.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    const canvas = createCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d')
    await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
    canvas: canvas as unknown as HTMLCanvasElement,
  }).promise
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    await task.destroy()
    expect(countDarkPixels(data)).toBeGreaterThan(0.9 * canvas.width * canvas.height)
  })
})
