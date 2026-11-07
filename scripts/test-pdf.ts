/** A minimal PDF from object bodies, numbered from 1. Object 1 must be the catalog. For tests only. */
export function buildPdf(objects: string[]): Uint8Array {
  let body = '%PDF-1.5\n'
  const offsets = objects.map((object, i) => {
    const offset = body.length
    body += `${i + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Uint8Array.from(body, (c) => c.charCodeAt(0))
}

export function stream(content: string, dictionary = ''): string {
  return `<< ${dictionary} /Length ${content.length} >>\nstream\n${content}\nendstream`
}
