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

test('renders bold as strong', () => {
  const { container } = render(<Markdown text="**bold**" />)
  expect(container.querySelector('strong')?.textContent).toBe('bold')
})

test('applies className to the wrapper', () => {
  const { container } = render(<Markdown text="hi" className="prose" />)
  expect(container.firstElementChild).toHaveClass('prose')
})
