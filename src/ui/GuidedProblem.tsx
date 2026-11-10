import { useState } from 'react'
import type { ChoiceLabel, GuidedProblem } from '../content/schema'
import { Markdown } from './Markdown'

export interface GuidedOutcome {
  steps: number
  /** steps answered right with no wrong choice first */
  firstTryCorrect: number
}

/**
 * One guided problem, worked a step at a time. A wrong choice shows why it is wrong, is disabled, and
 * the student chooses again; the right one shows the explanation and reveals the next step. Finished
 * steps stay on screen, so the page builds into a worked solution. `onFinish` is called once each
 * time the last step is answered.
 */
export function GuidedProblemView({
  problem,
  onFinish,
}: {
  problem: GuidedProblem
  onFinish?: (outcome: GuidedOutcome) => void
}) {
  // the wrong choices tried at each step reached so far; the last entry is the step being worked
  const [tried, setTried] = useState<ChoiceLabel[][]>([[]])
  const [solved, setSolved] = useState(0)
  const total = problem.steps.length
  const finished = solved === total

  function choose(stepIndex: number, label: ChoiceLabel) {
    if (stepIndex !== solved || finished) return
    const step = problem.steps[stepIndex]
    if (label !== step.answer) {
      setTried((t) => t.map((labels, i) => (i === stepIndex && !labels.includes(label) ? [...labels, label] : labels)))
      return
    }
    const nowSolved = solved + 1
    setSolved(nowSolved)
    if (nowSolved < total) {
      setTried((t) => [...t, []])
    } else {
      onFinish?.({ steps: total, firstTryCorrect: tried.filter((labels) => labels.length === 0).length })
    }
  }

  function restart() {
    setTried([[]])
    setSolved(0)
  }

  const firstTry = tried.filter((labels, i) => i < solved && labels.length === 0).length

  return (
    <article className="guided" id={`guided-${problem.id}`}>
      <Markdown text={problem.stem} />
      {problem.figures?.map((path) => (
        <img key={path} src={'/' + path} alt="Figure for this problem" />
      ))}
      <ol className="guided-steps">
        {problem.steps.slice(0, Math.min(solved + 1, total)).map((step, i) => {
          const done = i < solved
          const wrong = tried[i] ?? []
          const lastWrong = wrong[wrong.length - 1]
          const note = step.choices.find((c) => c.label === lastWrong)?.note
          return (
            <li key={i} className="guided-step">
              <Markdown text={step.prompt} />
              <div className="choices">
                {step.choices.map((c) => {
                  const isAnswer = done && c.label === step.answer
                  const isWrong = wrong.includes(c.label)
                  return (
                    <button
                      key={c.label}
                      type="button"
                      className={`choice${isAnswer ? ' correct' : isWrong ? ' wrong' : ''}`}
                      disabled={done || isWrong}
                      onClick={() => choose(i, c.label)}
                    >
                      <strong className="choice-label">{c.label}</strong> <Markdown text={c.text} className="choice-text" />
                      {isAnswer && <span className="visually-hidden"> Correct</span>}
                      {isWrong && <span className="visually-hidden"> Not this one</span>}
                    </button>
                  )
                })}
              </div>
              {!done && note && (
                <div className="guided-note" role="status">
                  <Markdown text={note} />
                </div>
              )}
              {done && (
                <div className="guided-explanation" role={i === solved - 1 ? 'status' : undefined}>
                  <Markdown text={step.explanation} />
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {!finished && <p className="guided-progress">{`Step ${solved + 1} of ${total}`}</p>}
      {finished && (
        <div className="guided-end">
          <Markdown text={problem.takeaway} className="guided-takeaway" />
          <p className="guided-score">{`${firstTry} of ${total} steps right on the first try`}</p>
          <button type="button" onClick={restart}>
            Work it again
          </button>
        </div>
      )}
    </article>
  )
}
