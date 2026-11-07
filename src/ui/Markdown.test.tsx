import { createRequire } from 'node:module'
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { Markdown } from './Markdown'

test('renders inline math with KaTeX', () => {
  const { container } = render(<Markdown text="Area is $x^2$." />)
  expect(container.querySelector('.katex')).not.toBeNull()
})

test('renders invalid math as a katex-error span with the raw source, without throwing', () => {
  const { container } = render(<Markdown text="Broken $\frac{$ here" />)
  const err = container.querySelector('span.katex-error')
  expect(err).not.toBeNull()
  expect(err!.textContent).toContain('\\frac{')
})

test('a fenced $$ block renders as display math', () => {
  const { container } = render(<Markdown text={'Sum:\n\n$$\nx^2\n$$\n\nDone.'} />)
  expect(container.querySelector('.katex-display')).not.toBeNull()
  expect(container.textContent).not.toContain('$$')
})

test('a one-line $$...$$ renders inline, which is why content must fence display math', () => {
  const { container } = render(<Markdown text={'Sum:\n\n$$x^2$$\n\nDone.'} />)
  expect(container.querySelector('.katex')).not.toBeNull()
  expect(container.querySelector('.katex-display')).toBeNull()
})

test('an escaped dollar renders as a literal dollar beside real math', () => {
  const { container } = render(<Markdown text={'costs \\$5 and $x^2$ here'} />)
  expect(container.textContent).toContain('costs $5 and')
  expect(container.querySelectorAll('.katex')).toHaveLength(1)
})

test('renders bold as strong', () => {
  const { container } = render(<Markdown text="**bold**" />)
  expect(container.querySelector('strong')?.textContent).toBe('bold')
})

test('applies className to the wrapper', () => {
  const { container } = render(<Markdown text="hi" className="prose" />)
  expect(container.firstElementChild).toHaveClass('prose')
})

test('the KaTeX stylesheet comes from the same KaTeX version that rehype-katex renders with', () => {
  // a mismatch shifts fraction and exponent boxes, so inline math overlaps on the page
  const appRequire = createRequire(import.meta.url)
  const appKatex = appRequire('katex/package.json').version
  const rehypeRequire = createRequire(appRequire.resolve('rehype-katex'))
  expect(rehypeRequire('katex/package.json').version).toBe(appKatex)
})
