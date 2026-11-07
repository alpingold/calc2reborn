import fs from 'node:fs'
import { ARCHIVE_URL, parseArchive } from './pipeline'

const res = await fetch(ARCHIVE_URL, { headers: { 'User-Agent': 'ma16200-study-app/0.1' } })
if (!res.ok) throw new Error(`Archive fetch failed: ${res.status}`)
const entries = parseArchive(await res.text())
const out = new URL('./exams-manifest.json', import.meta.url)
fs.writeFileSync(out, JSON.stringify(entries, null, 2) + '\n')
console.log(`Wrote ${entries.length} exams (newest ${entries[0]?.examId})`)
