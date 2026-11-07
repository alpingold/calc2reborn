import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useContent } from '../../storage/context'
import { QuestionView } from '../QuestionView'

export function ContentReview() {
  const content = useContent()
  const [params, setParams] = useSearchParams()
  const [copied, setCopied] = useState(false)

  if (content.exams.length === 0) {
    return (
      <section>
        <h2>Content review</h2>
        <p>No exams transcribed yet.</p>
      </section>
    )
  }

  const exam = content.exams.find((e) => e.id === params.get('exam')) ?? content.exams[0]
  const total = exam.questions.length
  const qNum = Number(params.get('q'))
  const index = Number.isInteger(qNum) && qNum >= 1 && qNum <= total ? qNum - 1 : 0
  const question = exam.questions[index]
  const page = question.sourcePage ?? Math.floor((question.number - 1) / 2) + 3

  function go(examId: string, n: number) {
    setCopied(false)
    setParams({ exam: examId, q: String(n) })
  }

  async function markReviewed() {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ id: question.id, status: 'reviewed' }))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section>
      <h2>Content review</h2>
      <div>
        <label>
          Exam{' '}
          <select value={exam.id} onChange={(e) => go(e.target.value, 1)}>
            {content.exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.id}
              </option>
            ))}
          </select>
        </label>{' '}
        <button type="button" disabled={index === 0} onClick={() => go(exam.id, index)}>
          Prev
        </button>{' '}
        <span>
          Question {index + 1} of {total}
        </span>{' '}
        <button type="button" disabled={index === total - 1} onClick={() => go(exam.id, index + 2)}>
          Next
        </button>
      </div>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <QuestionView key={question.id} question={question} mode="deferred" revealed chosen={question.answer} onChoose={() => {}} />
          <p>Lessons: {question.lessonIds.join(', ')}</p>
          <p>Tags: {question.tags?.length ? question.tags.join(', ') : 'none'}</p>
          <p>Status: {question.status}</p>
          <p>Answer: {question.answer}</p>
          <p>Source page: {page}</p>
          <button type="button" onClick={markReviewed}>
            Mark reviewed
          </button>
          <span role="status">{copied ? 'Copied' : ''}</span>
        </div>
        <div style={{ flex: 1 }}>
          <img src={`/raw-pages/${exam.id}/p${page}.png`} alt={`Source page ${page} of ${exam.id}`} style={{ maxWidth: '100%' }} />
        </div>
      </div>
    </section>
  )
}
