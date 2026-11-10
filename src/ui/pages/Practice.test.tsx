import { expect, test } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Link, MemoryRouter, useLocation } from 'react-router'
import type { ReactNode } from 'react'
import { Practice } from './Practice'
import { StoreProvider } from '../../storage/context'
import { MemoryStore } from '../../storage/memory'
import { DEFAULT_SETTINGS } from '../../storage/types'
import { buildContent } from '../../content'
import type { Content } from '../../content'
import { fixtureCard, fixtureLessons, fixtureTypes } from '../../test/fixtures'
import { createScheduler } from '../../engine/fsrs'
import type { Choice, Exam, Question } from '../../content/schema'

const NOW = new Date('2026-11-06T12:00:00Z')
const TOMORROW = '2026-11-07T12:00:00.000Z'

const choices: Choice[] = [
  { label: 'A', text: 'alpha' },
  { label: 'B', text: 'beta' },
  { label: 'C', text: 'gamma' },
  { label: 'D', text: 'delta' },
  { label: 'E', text: 'epsilon' },
]

function q(n: number, stem: string, answer: Choice['label']): Question {
  return { id: `t-q${n}`, number: n, points: 6, stem, choices, answer, lessonIds: ['L19'], status: 'reviewed' }
}

const seedExam: Exam = {
  id: 'test-fall-2025-2',
  term: 'Fall',
  year: 2025,
  exam: '2',
  examUrl: '',
  durationMinutes: 60,
  questions: [q(1, 'Stem one', 'C'), q(2, 'Stem two', 'A'), q(3, 'Stem three', 'E')],
}
const STEMS = ['Stem one', 'Stem two', 'Stem three']
const RIGHT: Record<string, string> = { 'Stem one': 'c', 'Stem two': 'a', 'Stem three': 'e' }
const RANGE = '/practice?from=L19&to=L19'

const content = buildContent(fixtureLessons(), [fixtureCard('L19-c01', 'L19')], [seedExam])

function Where() {
  const l = useLocation()
  return <p>{`at:${l.pathname}${l.search}`}</p>
}

async function setup(
  opts: { url?: string; store?: MemoryStore; extra?: ReactNode; settings?: Partial<typeof DEFAULT_SETTINGS>; wait?: string; content?: Content } = {},
) {
  const store = opts.store ?? new MemoryStore()
  await store.saveSettings({ ...DEFAULT_SETTINGS, currentLessonId: 'L19', ...opts.settings })
  const scheduler = await createScheduler()
  const st = scheduler.newState('L19-c01', new Date('2026-11-01T00:00:00Z'))
  await store.saveCardState({ ...st, fsrs: { ...st.fsrs, dueAt: TOMORROW } })
  const clock = { t: NOW }
  render(
    <MemoryRouter initialEntries={[opts.url ?? RANGE]}>
      <StoreProvider store={store} scheduler={scheduler} content={opts.content ?? content} rng={() => 0} now={() => clock.t}>
        <Practice />
        {opts.extra}
      </StoreProvider>
    </MemoryRouter>,
  )
  await screen.findByText(opts.wait ?? 'Stem one')
  return { store, clock }
}

function currentStem(): string {
  return STEMS.find((s) => screen.queryByText(s))!
}

async function answer(key: string) {
  await userEvent.keyboard(`${key}{Enter}`)
  await screen.findByRole('status')
}

test('answering wrong logs a practice attempt and pulls the L19 card forward to now', async () => {
  const { store, clock } = await setup()
  clock.t = new Date(NOW.getTime() + 8000)
  await userEvent.keyboard('a{Enter}')
  expect(await screen.findByRole('status')).toHaveTextContent('Not quite')
  const attempts = await store.listAttempts()
  expect(attempts).toHaveLength(1)
  expect(attempts[0]).toMatchObject({
    questionId: 't-q1',
    chosen: 'A',
    correct: false,
    mode: 'practice',
    seconds: 8,
    timestamp: clock.t.toISOString(),
  })
  expect(typeof attempts[0].id).toBe('string')
  expect((await store.getCardState('L19-c01'))!.fsrs.dueAt).toBe(clock.t.toISOString())
  expect(screen.getByText('Correct 0 of 1')).toBeInTheDocument()
})

test('answering right logs a correct attempt and leaves the card state untouched', async () => {
  const { store } = await setup()
  await userEvent.keyboard('c{Enter}')
  expect(await screen.findByRole('status')).toHaveTextContent('Correct')
  const attempts = await store.listAttempts()
  expect(attempts).toHaveLength(1)
  expect(attempts[0]).toMatchObject({ questionId: 't-q1', chosen: 'C', correct: true, mode: 'practice' })
  expect((await store.getCardState('L19-c01'))!.fsrs.dueAt).toBe(TOMORROW)
  expect(screen.getByText('Correct 1 of 1')).toBeInTheDocument()
})

test('revealed answer shows the lesson link', async () => {
  await setup()
  await userEvent.keyboard('a{Enter}')
  await screen.findByRole('status')
  expect(screen.getByRole('link', { name: 'Lesson 19: Topic 19' })).toHaveAttribute(
    'href',
    '/course/L19',
  )
})

test('no question repeats within a session; then shows No more questions in range', async () => {
  await setup()
  const seen: string[] = []
  for (let i = 0; i < 3; i++) {
    const stem = currentStem()
    expect(stem).toBeDefined()
    seen.push(stem)
    await answer(RIGHT[stem])
    if (i < 2) {
      await userEvent.click(screen.getByRole('button', { name: 'Next' }))
      await screen.findByRole('button', { name: 'Submit' })
    } else {
      await userEvent.keyboard('{Enter}')
    }
  }
  expect(new Set(seen).size).toBe(3)
  expect(await screen.findByText('No more questions in range')).toBeInTheDocument()
  expect(screen.getByText('Correct 3 of 3')).toBeInTheDocument()
  expect(screen.getByText('No misses this session.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/')
})

test('Enter after reveal advances exactly one question', async () => {
  await setup()
  await userEvent.keyboard('a{Enter}')
  await screen.findByRole('status')
  await userEvent.keyboard('{Enter}')
  expect(await screen.findByText('Stem two')).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByText('Correct 0 of 1')).toBeInTheDocument()
})

test('?lesson=L19 logs mode lesson', async () => {
  const { store } = await setup({ url: '/practice?lesson=L19' })
  await userEvent.keyboard('b{Enter}')
  await screen.findByRole('status')
  const attempts = await store.listAttempts()
  expect(attempts).toHaveLength(1)
  expect(attempts[0].mode).toBe('lesson')
})

test('Stop ends the session with a summary', async () => {
  await setup()
  await answer('a')
  await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
  expect(screen.getByText('Correct 0 of 1')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Lessons to revisit' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Lesson 19: Topic 19' })).toHaveAttribute('href', '/course/L19')
  expect(screen.queryByText('No more questions in range')).not.toBeInTheDocument()
})

test('Enter on the focused Stop button does not submit', async () => {
  const { store } = await setup()
  await userEvent.keyboard('a')
  const stop = screen.getByRole('button', { name: 'Stop' })
  stop.focus()
  await act(async () => {
    stop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(await store.listAttempts()).toHaveLength(0)
})

test('double Enter logs only one attempt', async () => {
  const { store } = await setup()
  await userEvent.keyboard('a')
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
  })
  await screen.findByRole('status')
  expect(screen.getByText('Stem one')).toBeInTheDocument()
  expect(await store.listAttempts()).toHaveLength(1)
})

test('save failure shows an alert and allows retry', async () => {
  const store = new MemoryStore()
  const real = store.logAttempt.bind(store)
  let fail = true
  store.logAttempt = async (a) => {
    if (fail) {
      fail = false
      throw new Error('boom')
    }
    return real(a)
  }
  await setup({ store })
  await userEvent.keyboard('a{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your answer. Try again.')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  await userEvent.keyboard('{Enter}')
  expect(await screen.findByRole('status')).toHaveTextContent('Not quite')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(await store.listAttempts()).toHaveLength(1)
  expect(screen.getByText('Correct 0 of 1')).toBeInTheDocument()
})

test('changing the scope in the address starts a fresh session', async () => {
  await setup({ url: '/practice?lesson=L19', extra: <Link to={RANGE}>All lessons</Link> })
  for (let i = 0; i < 3; i++) {
    await answer(RIGHT[currentStem()])
    await userEvent.keyboard('{Enter}')
    if (i < 2) await screen.findByRole('button', { name: 'Submit' })
  }
  expect(await screen.findByText('No more questions in range')).toBeInTheDocument()
  expect(screen.getByText('Correct 3 of 3')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'All lessons' }))
  expect(await screen.findByText('Stem one')).toBeInTheDocument()
  expect(screen.getByText('Correct 0 of 0')).toBeInTheDocument()
  expect(screen.queryByText('No more questions in range')).not.toBeInTheDocument()
})

test('a missed question comes back once the others run out, marked as a second try', async () => {
  const { store } = await setup()
  await answer('a') // Stem one, wrong
  for (let i = 0; i < 2; i++) {
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('button', { name: 'Submit' })
    await answer(RIGHT[currentStem()])
  }
  await userEvent.keyboard('{Enter}')
  expect(await screen.findByText('Stem one')).toBeInTheDocument()
  expect(screen.getByText(/Second try/)).toBeInTheDocument()
  await answer('c')
  expect(screen.getByRole('status')).toHaveTextContent('Correct')
  await userEvent.keyboard('{Enter}')
  expect(await screen.findByText('No more questions in range')).toBeInTheDocument()
  expect(screen.getByText('Correct 3 of 4')).toBeInTheDocument()
  const attempts = await store.listAttempts()
  expect(attempts.filter((a) => a.questionId === 't-q1').map((a) => a.correct)).toEqual([false, true])
})

test('a question missed twice in a session is not retried again', async () => {
  await setup()
  await answer('a') // Stem one, wrong
  for (let i = 0; i < 2; i++) {
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('button', { name: 'Submit' })
    await answer(RIGHT[currentStem()])
  }
  await userEvent.keyboard('{Enter}')
  await screen.findByText(/Second try/)
  await answer('a')
  await userEvent.keyboard('{Enter}')
  expect(await screen.findByText('No more questions in range')).toBeInTheDocument()
  expect(screen.getByText('Correct 2 of 4')).toBeInTheDocument()
})

test('a session with a length ends there with a summary, and Practice again starts over', async () => {
  await setup({ url: '/practice?from=L19&to=L19&n=2' })
  expect(screen.getByText('Question 1 of 2')).toBeInTheDocument()
  await answer('a')
  await userEvent.keyboard('{Enter}')
  await screen.findByText('Question 2 of 2')
  await answer(RIGHT[currentStem()])
  await userEvent.keyboard('{Enter}')
  expect(await screen.findByText('Correct 1 of 2')).toBeInTheDocument()
  expect(screen.queryByText('No more questions in range')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Lesson 19: Topic 19' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'Practice again' }))
  expect(await screen.findByText('Correct 0 of 0')).toBeInTheDocument()
  expect(screen.getByText('Question 1 of 2')).toBeInTheDocument()
})

test('the setup screen defaults to everything so far and 20 questions', async () => {
  await setup({ url: '/practice', wait: 'Start', extra: <Where /> })
  expect(screen.queryByRole('radio', { name: /Exam lessons/ })).not.toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Everything so far (L1 to L19)' })).toBeChecked()
  expect(screen.getByRole('radio', { name: '20 questions' })).toBeChecked()
  await userEvent.click(screen.getByRole('button', { name: 'Start' }))
  expect(await screen.findByText('at:/practice?from=L1&to=L19&n=20')).toBeInTheDocument()
  expect(await screen.findByText('Question 1 of 20')).toBeInTheDocument()
})

test('the setup screen defaults to the exam lessons while an exam is ahead', async () => {
  await setup({
    url: '/practice',
    wait: 'Start',
    extra: <Where />,
    settings: { examDate: '2026-11-09', examLessonIds: ['L19', 'L20'] },
  })
  expect(screen.getByRole('radio', { name: 'Exam lessons (L19 to L20)' })).toBeChecked()
  await userEvent.click(screen.getByRole('radio', { name: 'No limit' }))
  await userEvent.click(screen.getByRole('button', { name: 'Start' }))
  expect(await screen.findByText('at:/practice?from=L19&to=L20')).toBeInTheDocument()
})

test('the setup screen ignores an exam whose date has passed', async () => {
  await setup({ url: '/practice', wait: 'Start', settings: { examDate: '2026-11-01', examLessonIds: ['L19'] } })
  expect(screen.queryByRole('radio', { name: /Exam lessons/ })).not.toBeInTheDocument()
})

test('Choose a range picks the lessons', async () => {
  await setup({ url: '/practice', wait: 'Start', extra: <Where /> })
  await userEvent.click(screen.getByRole('radio', { name: 'Choose a range' }))
  await userEvent.selectOptions(screen.getByLabelText('From'), 'L19')
  await userEvent.selectOptions(screen.getByLabelText('To'), 'L21')
  await userEvent.click(screen.getByRole('radio', { name: '10 questions' }))
  await userEvent.click(screen.getByRole('button', { name: 'Start' }))
  expect(await screen.findByText('at:/practice?from=L19&to=L21&n=10')).toBeInTheDocument()
})

test('after a failed card update, retrying keeps the answer that was logged', async () => {
  const store = new MemoryStore()
  const real = store.listCardStates.bind(store)
  let fail = true
  store.listCardStates = async () => {
    if (fail) {
      fail = false
      throw new Error('boom')
    }
    return real()
  }
  await setup({ store })
  await userEvent.keyboard('a{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your answer. Try again.')
  // the attempt was logged as A; changing the choice now must not change the outcome
  await userEvent.keyboard('c{Enter}')
  expect(await screen.findByRole('status')).toHaveTextContent('Not quite')
  expect(screen.getByRole('button', { name: /Your answer$/ })).toHaveTextContent('alpha')
  const attempts = await store.listAttempts()
  expect(attempts).toHaveLength(1)
  expect(attempts[0].chosen).toBe('A')
  expect(screen.getByText('Correct 0 of 1')).toBeInTheDocument()
})

test('a failed question load offers Try again', async () => {
  const store = new MemoryStore()
  const real = store.listAttempts.bind(store)
  let fail = true
  store.listAttempts = async (f) => {
    if (fail) {
      fail = false
      throw new Error('boom')
    }
    return real(f)
  }
  await setup({ store, wait: 'Could not load a question. Try again.' })
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('Stem one')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

// ---- practice by problem type, and retry-only practice

const typedLessons = fixtureLessons().map((l) => (['L18', 'L19', 'L20'].includes(l.id) ? { ...l, problemTypes: fixtureTypes(l.id) } : l))
function tq(n: number, stem: string, lessonId: string, typeIds?: string[]): Question {
  return { id: `ty-q${n}`, number: n, points: 6, stem, choices, answer: 'C', lessonIds: [lessonId], typeIds, status: 'reviewed' }
}
const typedExam: Exam = {
  id: 'typed-fall-2025-1',
  term: 'Fall',
  year: 2025,
  exam: '1',
  examUrl: '',
  durationMinutes: 60,
  questions: [
    tq(1, 'A one', 'L19', ['L19-a']),
    tq(2, 'A two', 'L19', ['L19-a']),
    tq(3, 'B one', 'L19', ['L19-b']),
    tq(4, 'Plain', 'L19'),
    tq(5, 'Eighteen', 'L18', ['L18-a']),
    tq(6, 'Twenty', 'L20', ['L20-a']),
  ],
}
const typedContent = buildContent(typedLessons, [fixtureCard('L19-c01', 'L19')], [typedExam])
const TYPED_STEMS = ['A one', 'A two', 'B one', 'Plain', 'Eighteen', 'Twenty']
const typedStem = () => TYPED_STEMS.find((x) => screen.queryByText(x))!

/** Answer every question served until the session ends; returns the stems in the order served. */
async function playThrough(key = 'c'): Promise<string[]> {
  const seen: string[] = []
  for (let i = 0; i < 12; i++) {
    const stem = typedStem()
    if (!stem) break
    seen.push(stem)
    await answer(key)
    await userEvent.keyboard('{Enter}')
    await act(async () => {})
    if (screen.queryByText(/^No more questions|^Nothing to retry/) || screen.queryByRole('link', { name: 'Practice again' })) break
  }
  return seen
}

function miss(n: number, timestamp: string, correct = false) {
  return { id: `m${n}-${timestamp}`, questionId: `ty-q${n}`, chosen: 'A' as const, correct, seconds: 5, timestamp, mode: 'practice' as const }
}

test('?types serves only questions of that problem type, then ends', async () => {
  await setup({ url: '/practice?types=L19-a', content: typedContent, wait: 'A one' })
  const seen = await playThrough()
  expect(seen.sort()).toEqual(['A one', 'A two'])
  expect(await screen.findByText('No more questions in range')).toBeInTheDocument()
})

test('?types with two types serves both, and ?n ends the session early', async () => {
  await setup({ url: '/practice?types=L19-a,L19-b&n=2', content: typedContent, wait: 'A one' })
  expect(screen.getByText('Question 1 of 2')).toBeInTheDocument()
  const seen = await playThrough()
  expect(seen).toHaveLength(2)
  expect(screen.queryByText('No more questions in range')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Practice again' })).toBeInTheDocument()
})

test('?types with a type that does not exist says there are no questions', async () => {
  await setup({ url: '/practice?types=L19-zzz', content: typedContent, wait: 'No more questions in range' })
  expect(screen.queryByRole('link', { name: 'Practice again' })).not.toBeInTheDocument()
})

test('?types logs attempts as practice', async () => {
  const { store } = await setup({ url: '/practice?types=L19-b', content: typedContent, wait: 'B one' })
  await answer('c')
  expect(await store.listAttempts()).toMatchObject([{ questionId: 'ty-q3', mode: 'practice', correct: true }])
})

test('?retry=1 serves only questions last missed a day or more ago, oldest miss first', async () => {
  const store = new MemoryStore()
  await store.logAttempt(miss(2, '2026-11-04T12:00:00.000Z'))
  await store.logAttempt(miss(1, '2026-11-01T12:00:00.000Z'))
  await store.logAttempt(miss(3, '2026-11-06T10:00:00.000Z')) // two hours ago: too recent
  await store.logAttempt(miss(4, '2026-11-01T12:00:00.000Z'))
  await store.logAttempt(miss(4, '2026-11-02T12:00:00.000Z', true)) // got it right since
  await setup({ url: '/practice?retry=1', store, content: typedContent, wait: 'A one' })
  const seen = await playThrough()
  expect(seen).toEqual(['A one', 'A two'])
  expect(await screen.findByText('No more questions to retry')).toBeInTheDocument()
})

test('a question missed again in a retry session does not come round a second time', async () => {
  const store = new MemoryStore()
  await store.logAttempt(miss(1, '2026-11-01T12:00:00.000Z'))
  await store.logAttempt(miss(2, '2026-11-02T12:00:00.000Z'))
  await setup({ url: '/practice?retry=1', store, content: typedContent, wait: 'A one' })
  const seen = await playThrough('a')
  expect(seen).toEqual(['A one', 'A two'])
  expect(screen.getByText('Correct 0 of 2')).toBeInTheDocument()
})

test('?retry=1 keeps to the lessons covered so far, and to the exam lessons while an exam is ahead', async () => {
  const seedMisses = async () => {
    const store = new MemoryStore()
    for (const n of [1, 5, 6]) await store.logAttempt(miss(n, `2026-11-0${n > 3 ? n - 3 : n}T12:00:00.000Z`))
    return store
  }
  // current lesson L19: L18 and L19 are covered, L20 is not
  const first = await setup({ url: '/practice?retry=1', store: await seedMisses(), content: typedContent, wait: 'A one' })
  expect(first.store).toBeDefined()
  expect((await playThrough()).sort()).toEqual(['A one', 'Eighteen'])
})

test('?retry=1 with an exam ahead serves only misses from the exam lessons', async () => {
  const store = new MemoryStore()
  for (const n of [1, 5, 6]) await store.logAttempt(miss(n, '2026-11-01T12:00:00.000Z'))
  await setup({
    url: '/practice?retry=1',
    store,
    content: typedContent,
    settings: { currentLessonId: 'L20', examDate: '2026-11-20', examLessonIds: ['L20'] },
    wait: 'Twenty',
  })
  expect(await playThrough()).toEqual(['Twenty'])
})

test('?retry=1 serves at most five questions', async () => {
  const many: Exam = { ...typedExam, questions: Array.from({ length: 8 }, (_, i) => tq(i + 1, `Many ${i + 1}`, 'L19')) }
  const store = new MemoryStore()
  for (let n = 1; n <= 8; n++) await store.logAttempt(miss(n, `2026-11-01T12:0${n}:00.000Z`))
  await setup({ url: '/practice?retry=1', store, content: buildContent(typedLessons, [], [many]), wait: 'Many 1' })
  let served = 0
  for (let i = 0; i < 10; i++) {
    if (!screen.queryByText(/^Many \d$/)) break
    served++
    await answer('c')
    await userEvent.keyboard('{Enter}')
    await act(async () => {})
  }
  expect(served).toBe(5)
})

test('?retry=1 with nothing to retry says so', async () => {
  await setup({ url: '/practice?retry=1', content: typedContent, wait: 'Nothing to retry right now' })
  expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
})
