import { describe, expect, it } from 'vitest'
import { buildContent } from '../content'
import type { Choice, Exam, Lesson, Question } from '../content/schema'
import type { Attempt, CardState, GuidedResult, Settings } from '../storage/types'
import { DEFAULT_SETTINGS } from '../storage/types'
import { fixtureCard, fixtureGuided, fixtureLesson, fixtureTypes } from '../test/fixtures'
import type { Mastery } from './mastery'
import { PRACTISE_TARGET, todayPlan, weakestTypes } from './today'

const NOW = new Date(2026, 10, 10, 12, 0)
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString()

const choices: Choice[] = (['A', 'B', 'C', 'D', 'E'] as const).map((label) => ({ label, text: label }))
function question(id: string, lessonId: string, typeIds?: string[]): Question {
  return { id, number: 1, points: 6, stem: id, choices, answer: 'A', lessonIds: [lessonId], typeIds, status: 'reviewed' }
}
function exam(questions: Question[]): Exam {
  return { id: 'e', term: 'Fall', year: 2025, exam: '1', examUrl: '', durationMinutes: 60, questions }
}
const lessons: Lesson[] = [1, 2, 3, 4].map((n) => fixtureLesson(n, { problemTypes: fixtureTypes(`L${n}`) }))

let seq = 0
function attempt(questionId: string, correct: boolean, timestamp: string, mode: Attempt['mode'] = 'practice'): Attempt {
  return { id: `a${seq++}`, questionId, chosen: correct ? 'A' : 'B', correct, seconds: 5, timestamp, mode }
}
function state(cardId: string, dueAt: string, lastReviewAt: string | null = null): CardState {
  return { cardId, introducedAt: at(1), fsrs: { dueAt, lastReviewAt } } as unknown as CardState
}
const isDue = (s: CardState, n: Date) => new Date(s.fsrs.dueAt) <= n
const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, currentLessonId: 'L2', ...over })

function plan(args: {
  questions?: Question[]
  cards?: ReturnType<typeof fixtureCard>[]
  attempts?: Attempt[]
  states?: CardState[]
  settings?: Settings
  now?: Date
  problems?: ReturnType<typeof fixtureGuided>[]
  guided?: GuidedResult[]
}) {
  return todayPlan({
    now: args.now ?? NOW,
    attempts: args.attempts ?? [],
    states: args.states ?? [],
    guided: args.guided ?? [],
    settings: args.settings ?? settings(),
    content: buildContent(lessons, args.cards ?? [], [exam(args.questions ?? [])], args.problems ?? []),
    isDue,
  })
}

describe('weakestTypes', () => {
  const m = (score: number | null): Mastery => ({ score, attempts: score === null ? 0 : 3 })
  it('puts weak types first, lowest score first, then untested current-lesson types, then other untested', () => {
    const mastery = new Map([
      ['a', m(0.9)],
      ['b', m(0.5)],
      ['c', m(null)],
      ['d', m(0.2)],
      ['e', m(null)],
    ])
    const order = weakestTypes({ mastery, scopeTypeIds: ['a', 'b', 'c', 'd', 'e'], currentLessonTypeIds: ['e'], count: 5 })
    expect(order).toEqual(['d', 'b', 'e', 'c', 'a'])
  })
  it('returns at most count, and treats a type with no mastery entry as untested', () => {
    expect(weakestTypes({ mastery: new Map(), scopeTypeIds: ['a', 'b', 'c'], currentLessonTypeIds: [], count: 2 })).toEqual(['a', 'b'])
  })
})

describe('todayPlan', () => {
  it('is empty when there are no cards, misses or typed questions', () => {
    expect(plan({ questions: [question('q1', 'L1')] })).toEqual([])
  })

  it('counts due and new cards as Review does, skipping cards no longer in the content', () => {
    const cards = [fixtureCard('c1', 'L1'), fixtureCard('c2', 'L2'), fixtureCard('c3', 'L3')]
    const items = plan({ cards, states: [state('c1', at(9)), state('gone', at(9))] })
    // c2 is new; c3 belongs to a lesson after the current one
    expect(items).toEqual([{ kind: 'review', due: 1, fresh: 1, done: false }])
  })

  it('keeps the review item, done, once a card was reviewed today and none remain', () => {
    const cards = [fixtureCard('c1', 'L1')]
    expect(plan({ cards, states: [state('c1', at(20), at(10, 9))] })).toEqual([{ kind: 'review', due: 0, fresh: 0, done: true }])
    // reviewed on an earlier day and nothing left: not listed
    expect(plan({ cards, states: [state('c1', at(20), at(9))] })).toEqual([])
  })

  it('lists misses from before today, at most five, and ticks them off as they are answered', () => {
    const questions = Array.from({ length: 7 }, (_, i) => question(`q${i}`, 'L1'))
    const misses = questions.map((q) => attempt(q.id, false, at(8)))
    expect(plan({ questions, attempts: misses })).toEqual([{ kind: 'retry', count: 5, done: false }])
    const two = [attempt('q0', true, at(10, 9)), attempt('q1', false, at(10, 9))]
    expect(plan({ questions, attempts: [...misses, ...two] })).toEqual([{ kind: 'retry', count: 3, done: false }])
    const five = questions.slice(0, 5).map((q) => attempt(q.id, true, at(10, 9)))
    expect(plan({ questions, attempts: [...misses, ...five] })).toEqual([{ kind: 'retry', count: 0, done: true }])
  })

  it('leaves out a miss from today, one outside the scope, and one since answered right', () => {
    const questions = [question('q1', 'L1'), question('q2', 'L4'), question('q3', 'L1')]
    const attempts = [
      attempt('q1', false, at(10, 8)),
      attempt('q2', false, at(8)),
      attempt('q3', false, at(7)),
      attempt('q3', true, at(8)),
    ]
    expect(plan({ questions, attempts })).toEqual([])
  })

  it('counts an answer at 00:01 toward today and one at 23:59 toward yesterday', () => {
    const questions = [question('q1', 'L1', ['L1-a'])]
    const attempts = [attempt('q1', true, at(9, 23, 59)), attempt('q1', true, at(10, 0, 1))]
    expect(plan({ questions, attempts })).toEqual([
      { kind: 'practise', typeIds: ['L1-a'], answeredToday: 1, done: false },
    ])
  })

  it('names the two weakest types in scope that have questions and is done at the target', () => {
    const questions = [
      question('q1', 'L1', ['L1-a']),
      question('q2', 'L1', ['L1-b']),
      question('q3', 'L2', ['L2-b']),
      question('q4', 'L3', ['L3-a']),
    ]
    // L1-b is weak; L2-b is untested in the current lesson; L2-a has no question; L3 is out of scope
    const old = [1, 2, 3].map((d) => attempt('q2', false, at(d)))
    expect(plan({ questions, attempts: old })).toEqual([
      { kind: 'retry', count: 1, done: false },
      { kind: 'practise', typeIds: ['L1-b', 'L2-b'], answeredToday: 0, done: false },
    ])
    const today = Array.from({ length: PRACTISE_TARGET }, () => attempt('q1', true, at(10, 9)))
    const exams = [attempt('q1', true, at(10, 9), 'exam')]
    const items = plan({ questions, attempts: [...today, ...exams] })
    expect(items).toEqual([{ kind: 'practise', typeIds: ['L2-b', 'L1-b'], answeredToday: PRACTISE_TARGET, done: true }])
  })

  it('uses the exam lessons as scope while an exam is ahead, and the covered lessons once it has passed', () => {
    const questions = [question('q1', 'L1', ['L1-a']), question('q4', 'L4', ['L4-a'])]
    const ahead = settings({ examLessonIds: ['L4'], examDate: '2026-11-20' })
    expect(plan({ questions, settings: ahead })).toEqual([
      { kind: 'practise', typeIds: ['L4-a'], answeredToday: 0, done: false },
    ])
    const passed = settings({ examLessonIds: ['L4'], examDate: '2026-11-01' })
    expect(plan({ questions, settings: passed })[0]).toMatchObject({ typeIds: ['L1-a'] })
  })

  it('lists the current lesson\'s unfinished guided problems first, ticks the item the day the last is finished, then drops it', () => {
    const problems = [fixtureGuided('L2-g1', 'L2', 'L2-a'), fixtureGuided('L2-g2', 'L2', 'L2-b'), fixtureGuided('L1-g1', 'L1', 'L1-a')]
    const result = (problemId: string, completedAt: string): GuidedResult => ({ problemId, completedAt, steps: 3, firstTryCorrect: 3 })
    expect(plan({ problems })).toEqual([{ kind: 'guided', lessonId: 'L2', remaining: 2, done: false }])
    // an earlier lesson's problem and a result for a problem that no longer exists change nothing
    const some = [result('L2-g1', at(8)), result('L1-g1', at(8)), result('L2-g9', at(8))]
    expect(plan({ problems, guided: some })).toEqual([{ kind: 'guided', lessonId: 'L2', remaining: 1, done: false }])
    const all = [...some, result('L2-g2', at(10, 9))]
    expect(plan({ problems, guided: all })).toEqual([{ kind: 'guided', lessonId: 'L2', remaining: 0, done: true }])
    const allEarlier = [...some, result('L2-g2', at(9))]
    expect(plan({ problems, guided: allEarlier })).toEqual([])
    // no current lesson: nothing to work through
    expect(plan({ problems, settings: settings({ currentLessonId: null }) })).toEqual([])
  })
})
