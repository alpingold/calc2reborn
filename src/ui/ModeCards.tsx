/** How an exam or mock is taken: against the clock, or untimed with the solution after each answer. */
export type ExamMode = 'timed' | 'feedback'

/** Navigation state from the Exams page: start the mock at once, in the mode chosen there. */
export interface BeginState {
  begin: ExamMode
}

/** The choice between a timed exam and one with feedback, as two radio cards. */
export function ModeCards({ value, onChange, minutes }: { value: ExamMode; onChange(mode: ExamMode): void; minutes: number }) {
  return (
    <fieldset className="radio-cards">
      <legend>How do you want to take it?</legend>
      <label className={value === 'timed' ? 'radio-card selected' : 'radio-card'}>
        <input type="radio" name="exam-mode" checked={value === 'timed'} onChange={() => onChange('timed')} />
        <span>
          <span className="radio-card-title">Timed, like the real one</span>{' '}
          <span className="radio-card-detail">{`${minutes} minutes. Answers and solutions after you submit.`}</span>
        </span>
      </label>
      <label className={value === 'feedback' ? 'radio-card selected' : 'radio-card'}>
        <input type="radio" name="exam-mode" checked={value === 'feedback'} onChange={() => onChange('feedback')} />
        <span>
          <span className="radio-card-title">Untimed, with feedback</span>{' '}
          <span className="radio-card-detail">The solution after each answer. Checked answers lock, and there is no time limit.</span>
        </span>
      </label>
    </fieldset>
  )
}
