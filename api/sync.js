// Vercel function: GET and PUT /api/sync. See _core.js for the rules.
import { handleSync, upstashStorage } from './_core.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    res.status(503).json({ error: 'Sync is not set up' })
    return
  }
  try {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '')
    const out = await handleSync(
      {
        method: req.method,
        key: String(req.headers['x-sync-key'] ?? ''),
        body: req.body,
        ip: forwarded.split(',')[0].trim() || 'unknown',
      },
      upstashStorage(url, token),
    )
    res.status(out.status).json(out.json)
  } catch {
    res.status(502).json({ error: 'Storage is unavailable' })
  }
}
