import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { isPlanned } from '../../content/schema'
import { lessonMastery } from '../../engine/mastery'
import type { Mastery } from '../../engine/mastery'
import { examScope } from '../../engine/scope'
import type { CardState } from '../../storage/types'
import { useContent, useNow, useScheduler, useSettings, useStore } from '../../storage/context'
import { Markdown } from '../Markdown'
import { examTitle } from '../examSession'
import { practiseTypeLink } from '../practiseLink'
import { MASTERY_WORDS, masteryState, tallyText, typeTallies } from '../record'
import type { Tally } from '../record'
import { GUIDED_START, GuidedProblemView } from '../GuidedProblem'
import type { GuidedOutcome, GuidedProgress } from '../GuidedProblem'
import { CardDeck, type CardTag } from '../CardDeck'

type TabId = 'ideas' | 'guided' | 'cards' | 'exam'

/** The in-page anchors older links use, and the tab each one now opens. */
const HASH_TAB: Record<string, TabId> = {
  'key-ideas': 'ideas',
  guided: 'guided',
  flashcards: 'cards',
  'problem-types': 'exam',
  'exam-questions': 'exam',
}

// Route component: another lesson remounts the page, so its tab, deck and guided work start fresh.
export function Lesson() {
  const { lessonId = '' } = useParams()
  return <LessonView key={lessonId} lessonId={lessonId} />
}

function LessonView({ lessonId }: { lessonId: string }) {
  const store = useStore()
  const scheduler = useScheduler()
  const content = useContent()
  const { settings } = useSettings()
  const now = useNow()
  const navigate = useNavigate()
  const [mastery, setMastery] = useState<Mastery | null>(null)
  const [states, setStates] = useState<Map<string, CardState> | null>(null)
  const [tallies, setTallies] = useState<Map<string, Tally>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const { hash } = useLocation()
  const [searchParams] = useSearchParams()
  // guided problems finished, now or earlier
  const [doneGuided, setDoneGuided] = useState<Set<string>>(new Set())
  // how far each guided problem has been worked on this visit: kept here so it survives a change of tab
  const [working, setWorking] = useState<Record<string, GuidedProgress>>({})
  // the guided problem chosen with Previous and Next; one named in the address wins until then
  const [picked, setPicked] = useState<{ id: string; hash: string } | null>(null)
  const tabRefs = useRef(new Map<TabId, HTMLButtonElement>())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [attempts, all, results] = await Promise.all([
          store.listAttempts(),
          store.listCardStates(),
          store.listGuidedResults(),
        ])
        if (cancelled) return
        const m = lessonMastery(attempts, content.questionById, [lessonId])
        setMastery(m.get(lessonId) ?? { score: null, attempts: 0 })
        setStates(new Map(all.map((s) => [s.cardId, s])))
        setDoneGuided(new Set(results.map((r) => r.problemId)))
        setTallies(typeTallies(attempts, content.questionById))
      } catch {
        if (!cancelled) setError('Could not load your progress.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store, content, lessonId])

  // an address ending in #guided-<problemId>, or another id on the page, scrolls there
  useEffect(() => {
    if (hash.length < 2) return
    const id = hash.slice(1)
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView?.())
    return () => cancelAnimationFrame(frame)
  }, [hash, lessonId])

  async function onGuidedFinish(problemId: string, outcome: GuidedOutcome) {
    setDoneGuided((done) => new Set(done).add(problemId))
    try {
      await store.saveGuidedResult({ problemId, completedAt: now().toISOString(), ...outcome })
    } catch {
      setError('Could not save your progress.')
    }
  }

  const lesson = content.lessonById.get(lessonId)
  if (!lesson) {
    return (
      <section>
        <h2>Lesson not found</h2>
        <Link to="/course">Back to lessons</Link>
      </section>
    )
  }
  const cards = content.cardsByLesson.get(lesson.id) ?? []
  const questions = content.questionsByLesson.get(lesson.id) ?? []
  const types = lesson.problemTypes ?? []
  const guided = content.guidedByLesson.get(lesson.id) ?? []

  type CardStage = 'due' | 'later' | 'new'
  function stageOf(cardId: string): CardStage | null {
    if (!states) return null
    const s = states.get(cardId)
    if (!s) return 'new'
    return scheduler.isDue(s, now()) ? 'due' : 'later'
  }

  function cardTag(cardId: string): CardTag | null {
    const stage = stageOf(cardId)
    if (stage === 'new') return { stage, text: 'Not started' }
    if (stage === 'due') return { stage, text: 'Due today' }
    if (stage === 'later') {
      const when = new Date(states!.get(cardId)!.fsrs.dueAt)
      return { stage, text: `Next review ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` }
    }
    return null
  }

  const counts = { due: 0, later: 0, new: 0 }
  for (const c of cards) {
    const stage = stageOf(c.id)
    if (stage) counts[stage]++
  }
  const summaryParts = [
    counts.due > 0 && `${counts.due} due today`,
    counts.later > 0 && `${counts.later} scheduled later`,
    counts.new > 0 && `${counts.new} not started yet`,
  ].filter(Boolean)
  const cardSummary = `${cards.length} ${cards.length === 1 ? 'flashcard' : 'flashcards'}${
    states && summaryParts.length ? `: ${summaryParts.join(', ')}` : ''
  }`
  const cardsTabLine =
    cards.length === 0
      ? 'None yet'
      : `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}${
          !states ? '' : counts.due > 0 ? `, ${counts.due} due` : counts.new === cards.length ? ', none started' : ''
        }`

  const guidedDone = guided.filter((g) => doneGuided.has(g.id)).length
  const tabs = [
    { id: 'ideas' as const, verb: 'Read', label: 'Key ideas', line: lesson.sections.length > 0 ? `Sections ${lesson.sections.join(', ')}` : 'The ideas in brief', show: true },
    { id: 'guided' as const, verb: 'Work through', label: 'Guided problems', line: `${guidedDone} of ${guided.length} done`, show: guided.length > 0 },
    { id: 'cards' as const, verb: 'Memorise', label: 'Flashcards', line: cardsTabLine, show: !lesson.isExtra },
    {
      id: 'exam' as const,
      verb: 'Test',
      label: 'Exam questions',
      line:
        questions.length === 0
          ? 'None yet'
          : `${questions.length} ${questions.length === 1 ? 'question' : 'questions'}${
              types.length > 0 ? ` in ${types.length} ${types.length === 1 ? 'type' : 'types'}` : ''
            }`,
      show: true,
    },
  ].filter((t) => t.show)

  // the tab comes from ?tab=, else from an in-page anchor (#guided, #guided-<id>, #flashcards, ...), else Key ideas
  const anchor = hash.slice(1)
  const hashProblem = anchor.startsWith('guided-') ? guided.find((g) => g.id === anchor.slice('guided-'.length)) : undefined
  const asked = searchParams.get('tab') ?? (hashProblem ? 'guided' : HASH_TAB[anchor])
  const tab: TabId = tabs.find((t) => t.id === asked)?.id ?? 'ideas'

  function openTab(id: TabId) {
    navigate({ search: `?tab=${id}` }, { replace: true })
  }
  function onTabKey(e: KeyboardEvent, index: number) {
    const move = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[e.key]
    if (move === undefined) return
    e.preventDefault()
    const next = tabs[(move + tabs.length) % tabs.length]
    openTab(next.id)
    tabRefs.current.get(next.id)?.focus()
  }

  const problem = (picked && picked.hash === hash ? guided.find((g) => g.id === picked.id) : undefined) ?? hashProblem ?? guided[0]
  const problemIndex = problem ? guided.indexOf(problem) : -1
  const showProblem = (index: number) => setPicked({ id: guided[index].id, hash })

  const planned = content.lessons.filter(isPlanned)
  const at = planned.findIndex((l) => l.id === lesson.id)
  const previous = at > 0 ? planned[at - 1] : undefined
  const following = at >= 0 ? planned[at + 1] : undefined
  const onExam = examScope(settings, content.lessons, now()).lessonIds.includes(lesson.id)
  const state = masteryState(mastery?.score ?? null)
  const meta = [
    !lesson.isExtra && `Lesson ${lesson.number}`,
    lesson.sections.length > 0 && `Sections ${lesson.sections.join(', ')}`,
    onExam && 'on your next exam',
  ].filter(Boolean)

  return (
    <section className="lesson-page">
      <header className="page-head lesson-head">
        <div className="lesson-crumbs">
          <nav aria-label="Breadcrumb">
            <Link to="/course">Lessons</Link>
            {lesson.unit && <span className="crumb-rest">{` / ${lesson.unit}`}</span>}
          </nav>
          {(previous || following) && (
            <nav aria-label="Neighbouring lessons" className="lesson-neighbours">
              {previous && <Link to={`/course/${previous.id}`}>{`Lesson ${previous.number}`}</Link>}
              {previous && following && <span aria-hidden="true">·</span>}
              {following && <Link to={`/course/${following.id}`}>{`Lesson ${following.number}`}</Link>}
            </nav>
          )}
        </div>
        <div className="lesson-title">
          <h2>{lesson.title}</h2>
          {mastery && !lesson.isExtra && (
            <span className={`chip chip-${state}`}>
              {mastery.score === null ? MASTERY_WORDS.untested : `${MASTERY_WORDS[state]} · ${Math.round(mastery.score * 100)}%`}
            </span>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
        <p className="lesson-meta">
          {meta.length > 0 && <span>{meta.join(' · ')}</span>}
          {!lesson.isExtra && (
            <>
              <a href={lesson.videoUrl} target="_blank" rel="noreferrer">
                Dr. Chen's video
              </a>
              <a href={lesson.notesUrl} target="_blank" rel="noreferrer">
                Dr. Chen's notes
              </a>
            </>
          )}
        </p>
        {lesson.isExtra && (
          <p className="note">
            This topic is on older MA 16200 exams but is not part of Dr. Chen's Fall 2023 lessons, so it has no video,
            notes, or flashcards, and it doesn't count toward lesson mastery.
          </p>
        )}
      </header>

      <div role="tablist" aria-label="Lesson steps" className="tabs">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              if (el) tabRefs.current.set(t.id, el)
              else tabRefs.current.delete(t.id)
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className="tab"
            onClick={() => openTab(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            <span className="tab-step">{`${i + 1} · ${t.verb}`}</span> <span className="tab-label">{t.label}</span>{' '}
            <span className="tab-line">{t.line}</span>
          </button>
        ))}
      </div>

      <div className="split">
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} className="card split-main tab-panel">
          {tab === 'ideas' && (
            <>
              <h3>Key ideas</h3>
              {lesson.keyIdeas ? <Markdown text={lesson.keyIdeas} className="key-ideas" /> : <p>No key ideas yet.</p>}
            </>
          )}
          {tab === 'guided' && problem && (
            <>
              <div className="guided-head">
                <h3>{`Problem ${problemIndex + 1} of ${guided.length}`}</h3>
                <p className="guided-about">
                  <span>{content.typeById.get(problem.typeId)?.name}</span>
                  {doneGuided.has(problem.id) && <span className="chip chip-strong">Done</span>}
                </p>
              </div>
              <p className="hint">
                Work the problem a step at a time. Written for this app in the style of the course. These are not Purdue
                problems.
              </p>
              <GuidedProblemView
                key={problem.id}
                problem={problem}
                progress={working[problem.id] ?? GUIDED_START}
                onProgress={(next) => setWorking((w) => ({ ...w, [problem.id]: next }))}
                onFinish={(o) => void onGuidedFinish(problem.id, o)}
              />
              {guided.length > 1 && (
                <div className="actions guided-nav">
                  <button type="button" disabled={problemIndex === 0} onClick={() => showProblem(problemIndex - 1)}>
                    Previous problem
                  </button>
                  <button
                    type="button"
                    className={doneGuided.has(problem.id) ? 'primary' : undefined}
                    disabled={problemIndex === guided.length - 1}
                    onClick={() => showProblem(problemIndex + 1)}
                  >
                    Next problem
                  </button>
                </div>
              )}
            </>
          )}
          {tab === 'cards' && (
            <>
              <h3>Flashcards</h3>
              {cards.length === 0 ? (
                <p>No flashcards for this lesson yet.</p>
              ) : (
                <>
                  <p className="cards-summary">{cardSummary}</p>
                  <CardDeck cards={cards} tagFor={cardTag} />
                  <div className="actions">
                    <Link to={`/review?lesson=${lesson.id}`} className="button primary">
                      {counts.due + counts.new > 0 ? `Study these cards (${counts.due + counts.new})` : 'Study these cards'}
                    </Link>
                  </div>
                  <p className="hint">
                    Flipping through the cards here is for reading. "Study these cards" asks how well you knew each one
                    and brings it back just before you would forget it.
                  </p>
                </>
              )}
            </>
          )}
          {tab === 'exam' && (
            <>
              <h3>Exam questions</h3>
              {questions.length === 0 ? (
                <p>No exam questions yet.</p>
              ) : (
                <>
                  <p className="hint">
                    Practice serves these one at a time with the worked solution after each. The links open the whole
                    exam a question is from.
                  </p>
                  <div className="actions">
                    <Link to={`/practice?lesson=${lesson.id}`} className="button primary">
                      {lesson.isExtra ? 'Practice this topic' : 'Practice this lesson'}
                    </Link>
                  </div>
                  <ul className="exam-question-list">
                    {questions.map((q) => {
                      const exam = content.examByQuestionId.get(q.id)
                      if (!exam) return null
                      return (
                        <li key={q.id}>
                          <Link to={`/exams/${exam.id}`}>{`${examTitle(exam)} #${q.number}`}</Link>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
        {types.length > 0 && (
          <aside className="split-side">
            <section className="card lesson-types">
              <h3 className="label">How exams ask this lesson</h3>
              <ul className="row-list">
                {types.map((t) => {
                  const count = content.questionsByType.get(t.id)?.length ?? 0
                  const tally = tallies.get(t.id)
                  const record = tallyText(tally)
                  const body = (
                    <>
                      <span>
                        {t.name} <span className="row-sub">{`${count} ${count === 1 ? 'question' : 'questions'}`}</span>
                      </span>
                      <span className={tally && tally.total > 0 ? 'row-value' : 'row-value row-value-quiet'}>{record}</span>
                    </>
                  )
                  return (
                    <li key={t.id}>
                      {count > 0 ? (
                        <Link
                          to={practiseTypeLink(t.id)}
                          aria-label={`Practise ${t.name}, ${tally && tally.total > 0 ? `${record} right` : 'not tested'}`}
                        >
                          {body}
                        </Link>
                      ) : (
                        <span className="row-plain">{body}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
              <p className="hint">Your record is right answers out of all you have given. Choose a type to practise it.</p>
            </section>
          </aside>
        )}
      </div>
    </section>
  )
}
