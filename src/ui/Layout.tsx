import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { daysUntil } from '../engine/scope'
import { useSync } from '../sync/context'
import { useNow, useSettings, useStorageFallback } from '../storage/context'
import { ShellContext } from './shell'
import type { Shell } from './shell'

const icon = (children: ReactNode) => (
  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

/** The four destinations. Flashcards (/review) are reached from Practice, so Practice is marked there too. */
const NAV: { to: string; label: string; match: RegExp; icon: ReactNode }[] = [
  {
    to: '/',
    label: 'Today',
    match: /^\/$/,
    icon: icon(
      <>
        <circle cx="11" cy="11" r="4" />
        <path d="M11 2v2M11 18v2M2 11h2M18 11h2M4.6 4.6l1.4 1.4M16 16l1.4 1.4M4.6 17.4L6 16M16 6l1.4-1.4" />
      </>,
    ),
  },
  {
    to: '/course',
    label: 'Lessons',
    match: /^\/course(\/|$)/,
    icon: icon(<path d="M3 4h6a2 2 0 012 2v12a2 2 0 00-2-2H3zM19 4h-6a2 2 0 00-2 2v12a2 2 0 012-2h6z" />),
  },
  {
    to: '/practice',
    label: 'Practice',
    match: /^\/(practice|review)(\/|$)/,
    icon: icon(<path d="M4 17l4-1 9-9-3-3-9 9zM13 5l3 3" />),
  },
  {
    to: '/exams',
    label: 'Exams',
    match: /^\/(exams|results)(\/|$)/,
    icon: icon(
      <>
        <circle cx="11" cy="12" r="7" />
        <path d="M11 8v4l2.5 2M9 2h4" />
      </>,
    ),
  },
]

const REDRAW = [/^\/$/, /^\/course(\/|$)/, /^\/exams\/?$/, /^\/settings\/?$/]

function syncLine(sync: NonNullable<ReturnType<typeof useSync>>): string {
  if (sync.busy) return 'Syncing'
  if (sync.error) return 'Sync problem'
  if (!sync.lastSyncedAt) return 'Sync on'
  return `Synced ${new Date(sync.lastSyncedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

export function Layout() {
  const fallback = useStorageFallback()
  const sync = useSync()
  const { settings } = useSettings()
  const now = useNow()
  const { pathname } = useLocation()
  // how many session bars are on screen: while there is one, the navigation is hidden
  const [focus, setFocusCount] = useState(0)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const setFocus = useCallback((on: boolean) => setFocusCount((n) => Math.max(0, n + (on ? 1 : -1))), [])
  const shell = useMemo<Shell>(() => ({ slot, setFocus }), [slot, setFocus])
  // progress arriving from another device redraws a page that only shows progress; a page being
  // worked on (a question, an exam, a card) is left alone and picks it up when it is next opened
  const redraw = REDRAW.some((re) => re.test(pathname)) ? (sync?.dataVersion ?? 0) : 'steady'
  const focused = focus > 0
  const days = settings.examDate ? daysUntil(settings.examDate, now()) : null

  return (
    <ShellContext.Provider value={shell}>
      <div className={focused ? 'app app-focus' : 'app'}>
        {!focused && (
          <header className="site-header">
            <div className="site-header-inner">
              <h1 className="brand">
                <Link to="/">MA 16200</Link>
              </h1>
              <nav aria-label="Main" className="site-nav">
                {NAV.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={item.match.test(pathname) ? 'active' : undefined}
                    aria-current={item.match.test(pathname) ? 'page' : undefined}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="site-tools">
                {days !== null && days >= 0 && (
                  <Link to="/exams" className="exam-pill">
                    {days === 0 ? 'Exam today' : `Exam in ${days} ${days === 1 ? 'day' : 'days'}`}
                  </Link>
                )}
                {sync?.code && (
                  <Link to="/settings" className={sync.error ? 'sync-note sync-note-error' : 'sync-note'}>
                    {syncLine(sync)}
                  </Link>
                )}
                <NavLink to="/settings" className="settings-link">
                  Settings
                </NavLink>
              </div>
            </div>
          </header>
        )}
        <div ref={setSlot} className="session-slot" />
        {fallback && (
          <div role="status" className="banner">
            Progress will not be saved in this browser
          </div>
        )}
        <main>
          <Outlet key={redraw} />
        </main>
      </div>
    </ShellContext.Provider>
  )
}
