// A sync code is the only thing that ties two devices together: 16 characters, about 78 bits, made
// in the browser. The server never sees it, only a hash of it.

// no I, L, O, U, 0 or 1: nothing that is misread when copied by hand
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
export const CODE_LENGTH = 16

export function generateCode(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  let out = ''
  // bytes above the largest multiple of the alphabet size are thrown away, so every letter is equally likely
  const limit = 256 - (256 % ALPHABET.length)
  while (out.length < CODE_LENGTH) {
    for (const byte of random(new Uint8Array(32))) {
      if (byte < limit && out.length < CODE_LENGTH) out += ALPHABET[byte % ALPHABET.length]
    }
  }
  return out
}

/** The code as typed or pasted, without spaces, dashes or lower case; null if it cannot be a code. */
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (code.length !== CODE_LENGTH) return null
  for (const ch of code) if (!ALPHABET.includes(ch)) return null
  return code
}

export function formatCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code
}

/** What the server files the progress under. */
export async function codeKey(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(`ma16200-sync:${code}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
