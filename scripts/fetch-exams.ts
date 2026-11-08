import fs from 'node:fs'
import path from 'node:path'
import type { ManifestEntry } from './pipeline'

const manifest: ManifestEntry[] = JSON.parse(
  fs.readFileSync(new URL('./exams-manifest.json', import.meta.url), 'utf8'),
)
const wanted = process.argv.slice(2)
const entries = wanted.length ? manifest.filter((e) => wanted.includes(e.examId)) : manifest
const unknown = wanted.filter((id) => !manifest.some((e) => e.examId === id))
for (const id of unknown) console.error(`Unknown exam: ${id}`)

const dir = path.resolve('raw/exams')
fs.mkdirSync(dir, { recursive: true })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let requests = 0
let downloaded = 0
let skipped = 0
let failed = 0
for (const e of entries) {
  const files: [string, string | undefined][] = [
    [`${e.examId}.pdf`, e.examUrl],
    [`${e.examId}.ans.pdf`, e.answersUrl],
    [`${e.examId}.sol.pdf`, e.solutionsUrl],
  ]
  const status: string[] = []
  for (const [name, url] of files) {
    if (!url) continue
    const dest = path.join(dir, name)
    // a zero-byte file is a download that failed partway: fetch it again
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      skipped++
      status.push(`${name} skipped`)
      continue
    }
    // pause between requests to be gentle with the archive
    if (requests++ > 0) await sleep(500)
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'ma16200-study-app/0.1' } })
      if (!res.ok) throw new Error(String(res.status))
      fs.writeFileSync(dest, new Uint8Array(await res.arrayBuffer()))
      downloaded++
      status.push(`${name} ok`)
    } catch (err) {
      failed++
      status.push(`${name} FAILED (${(err as Error).message})`)
    }
  }
  console.log(`${e.examId}: ${status.join(', ')}`)
}
console.log(`Total: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`)
if (failed > 0 || unknown.length > 0) process.exitCode = 1
