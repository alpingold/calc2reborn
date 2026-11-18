import { createContext, useContext, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface Shell {
  /** where a session bar is drawn: the place of the site header */
  slot: HTMLElement | null
  /** called with true while a session is on screen, and false when it leaves */
  setFocus(on: boolean): void
}

/** Null where a page is shown without the Layout around it (tests of single pages). */
export const ShellContext = createContext<Shell | null>(null)

export type SegmentState = 'right' | 'wrong' | 'done' | 'todo'

/** One segment per question of a fixed-length session. The words are in `label`; the colours repeat them. */
export function ProgressStrip({ segments, current, label }: { segments: SegmentState[]; current: number; label: string }) {
  return (
    <div className="progress-strip" role="img" aria-label={label}>
      {segments.map((s, i) => (
        <span key={i} className={`seg seg-${s}${i === current ? ' seg-current' : ''}`} />
      ))}
    </div>
  )
}

/**
 * The slim bar shown in place of the site navigation while a practice session, a flashcard session or
 * an exam is in progress: a way out, what the session is, and how far along it is. Rendering it puts
 * the app into focus mode; removing it brings the navigation back.
 */
export function SessionBar({
  exit,
  title,
  progress,
  aside,
  children,
}: {
  /** the control that ends or leaves the session */
  exit: ReactNode
  title: string
  /** such as "Question 4 of 10" */
  progress?: string
  /** the score so far, or the exam clock */
  aside?: ReactNode
  /** a progress strip under the title */
  children?: ReactNode
}) {
  const shell = useContext(ShellContext)
  const setFocus = shell?.setFocus
  useLayoutEffect(() => {
    if (!setFocus) return
    setFocus(true)
    return () => setFocus(false)
  }, [setFocus])

  const bar = (
    // data-own-enter: Enter on a control here must not submit an answer or move to the next question
    <div className="session-bar" data-own-enter>
      <div className="session-bar-inner">
        <div className="session-exit">{exit}</div>
        <div className="session-what">
          <p className="session-line">
            <span className="session-title">{title}</span>
            {progress && <span className="session-progress">{progress}</span>}
          </p>
          {children}
        </div>
        {aside && <div className="session-aside">{aside}</div>}
      </div>
    </div>
  )
  return shell?.slot ? createPortal(bar, shell.slot) : bar
}

/** The cross drawn beside "End session". */
export function ExitIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 4l10 10M14 4L4 14" />
    </svg>
  )
}

export function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9.5l4 4 8-9" />
    </svg>
  )
}

export function CrossIcon() {
  return (
    <svg aria-hidden="true" className="icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M4 4l10 10M14 4L4 14" />
    </svg>
  )
}
