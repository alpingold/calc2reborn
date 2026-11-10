// Progress travels as one string: gzipped JSON in base64 ("g:..."), or plain JSON ("j:...") in a
// browser without CompressionStream. Gzip shrinks a snapshot about tenfold.

async function pipe(stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }, input: Uint8Array) {
  const writer = stream.writable.getWriter()
  void writer.write(input)
  void writer.close()
  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export async function pack(value: unknown): Promise<string> {
  const json = JSON.stringify(value)
  if (typeof CompressionStream === 'undefined') return 'j:' + json
  const zipped = await pipe(new CompressionStream('gzip') as never, new TextEncoder().encode(json))
  return 'g:' + toBase64(zipped)
}

/** Throws if the string is not something `pack` made. */
export async function unpack(data: string): Promise<unknown> {
  if (data.startsWith('j:')) return JSON.parse(data.slice(2))
  if (!data.startsWith('g:')) throw new Error('Unknown format')
  const bytes = await pipe(new DecompressionStream('gzip') as never, fromBase64(data.slice(2)))
  return JSON.parse(new TextDecoder().decode(bytes))
}
