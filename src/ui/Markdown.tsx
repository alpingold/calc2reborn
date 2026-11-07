import ReactMarkdown from 'react-markdown'
import type { Options } from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

const remarkPlugins: Options['remarkPlugins'] = [remarkMath]
const rehypePlugins: Options['rehypePlugins'] = [[rehypeKatex, { throwOnError: false, errorColor: 'var(--danger)' }]]

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className ? `markdown ${className}` : 'markdown'}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
