import { useState } from 'react'
import type { ChoiceLabel, GuidedProblem } from '../content/schema'
import { Markdown } from './Markdown'
import { CheckIcon, CrossIcon } from './shell'

export interface GuidedOutcome {
  steps: number
  /** steps answered right with no wrong choice first */
  firstTryCorrect: number
}

/** How far a guided problem has been worked. */
export interface GuidedProgress {
  /** the wrong choices tried at each step reached so far; the last entry is the step being worked */
  tried: ChoiceLabel[][]
  solved: number
}

export const GUIDED_START: GuidedProgress = { tried: [[]], solved: 0 }

/**
 * One guided problem, worked a step at a time. A wrong choice is marked, shows inside itself why it is
 * wrong, and the student chooses again: the answer is never shown until it is found. The right choice
 * folds the step to one line, with its explanation open under it, and reveals the next step. `onFinish`
 * is called once each time the last step is answered. A parent that passes `progress` and `onProgress`
 * keeps the work itself, so it survives the problem leaving the screen.
 */
export function GuidedProblemView({
  problem,
  onFinish,
  progress,
  onProgress,
}: {
  problem: GuidedProblem
  onFinish?: (outcome: GuidedOutcome) => void
  progress?: GuidedProgress
  onProgress?: (next: GuidedProgress) => void
}) {
  const [own, setOwn] = useState<GuidedProgress>(GUIDED_START)
  const { tried, solved } = progress ?? own
  const set = (next: GuidedProgress) => (onProgress ? onProgress(next) : setOwn(next))
  const total = problem.steps.length
  const finished = solved === total

  function choose(stepIndex: number, label: ChoiceLabel) {
    if (stepIndex !== solved || finished) return
    const step = problem.steps[stepIndex]
    if (label !== step.answer) {
      set({ solved, tried: tried.map((labels, i) => (i === stepIndex && !labels.includes(label) ? [...labels, label] : labels)) })
      return
    }
    const nowSolved = solved + 1
    if (nowSolved < total) {
      set({ solved: nowSolved, tried: [...tried, []] })
    } else {
      set({ solved: nowSolved, tried })
      onFinish?.({ steps: total, firstTryCorrect: tried.filter((labels) => labels.length === 0).length })
    }
  }

  const firstTry = tried.filter((labels, i) => i < solved && labels.length === 0).length
  const stepLabel = finished ? `All ${total} steps done` : `Step ${solved + 1} of ${total}`

  return (
    <article className="guided" id={`guided-${problem.id}`}>
      <div className="guided-stem">
        <Markdown text={problem.stem} />
        {problem.figures?.map((path) => (
          <img key={path} className="figure" src={'/' + path} alt="Figure for this problem" />
        ))}
      </div>
      <div className="guided-progress">
        <p>{stepLabel}</p>
        <div className="progress-strip" role="img" aria-label={stepLabel}>
          {problem.steps.map((_, i) => (
            <span key={i} className={`seg ${i < solved ? 'seg-done' : i === solved ? 'seg-now' : 'seg-todo'}`} />
          ))}
        </div>
      </div>
      <ol className="guided-steps">
        {problem.steps.slice(0, Math.min(solved + 1, total)).map((step, i) => {
          if (i < solved) {
            const answer = step.choices.find((c) => c.label === step.answer)
            const latest = i === solved - 1
            return (
              <li key={i} className="guided-step guided-step-done">
                {/* data-own-enter: Enter on the summary opens the step, wherever this problem is shown */}
                <details open={latest} data-own-enter>
                  <summary>
                    <CheckIcon />
                    <span className="guided-step-num">{`Step ${i + 1}`}</span>
                    <span className="visually-hidden"> done: </span>
                    {answer && <Markdown text={answer.text} className="guided-step-answer" />}
                  </summary>
                  <div className="guided-step-body">
                    <Markdown text={step.prompt} className="guided-step-prompt" />
                    <div className="guided-explanation" role={latest ? 'status' : undefined}>
                      <Markdown text={step.explanation} />
                    </div>
                  </div>
                </details>
              </li>
            )
          }
          const wrong = tried[i] ?? []
          const lastWrong = wrong[wrong.length - 1]
          return (
            <li key={i} className="guided-step guided-step-current">
              <Markdown text={step.prompt} className="guided-prompt" />
              <div className="choices">
                {step.choices.map((c) => {
                  const isWrong = wrong.includes(c.label)
                  const button = (
                    <button
                      key={c.label}
                      type="button"
                      className={`choice${isWrong ? ' wrong' : ''}`}
                      disabled={isWrong}
                      onClick={() => choose(i, c.label)}
                    >
                      <strong className="choice-label">{c.label}</strong> <Markdown text={c.text} className="choice-text" />
                      {isWrong && (
                        <span className="choice-mark">
                          {' '}
                          <CrossIcon />
                          Not this one
                        </span>
                      )}
                    </button>
                  )
                  if (!isWrong) return button
                  return (
                    <div key={c.label} className="choice-with-note">
                      {button}
                      {c.note && (
                        <div className="guided-note" role={c.label === lastWrong ? 'status' : undefined}>
                          <Markdown text={c.note} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {wrong.length > 0 && <p className="hint">Choose again. The answer stays hidden until you find it.</p>}
            </li>
          )
        })}
      </ol>
      {finished && (
        <div className="guided-end">
          <h4 className="label">Takeaway</h4>
          <Markdown text={problem.takeaway} className="guided-takeaway" />
          <p className="guided-score">{`${firstTry} of ${total} steps right on the first try`}</p>
          <button type="button" onClick={() => set(GUIDED_START)}>
            Work it again
          </button>
        </div>
      )}
    </article>
  )
}
