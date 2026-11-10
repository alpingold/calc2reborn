import { NavLink, Outlet, useLocation } from 'react-router'
import { useSync } from '../sync/context'
import { useStorageFallback } from '../storage/context'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/course', label: 'Course' },
  { to: '/review', label: 'Flashcards' },
  { to: '/practice', label: 'Practice' },
  { to: '/exams', label: 'Exams' },
  { to: '/settings', label: 'Settings' },
]

const REDRAW = [/^\/$/, /^\/course(\/|$)/, /^\/exams\/?$/, /^\/settings\/?$/]

export function Layout() {
  const fallback = useStorageFallback()
  const sync = useSync()
  const { pathname } = useLocation()
  // progress arriving from another device redraws a page that only shows progress; a page being
  // worked on (a question, an exam, a card) is left alone and picks it up when it is next opened
  const redraw = REDRAW.some((re) => re.test(pathname)) ? (sync?.dataVersion ?? 0) : 'steady'
  return (
    <div className="app">
      <header className="title-block">
        <div className="title-cell">
          <h1>MA 16200</h1>
          <p>Calculus II study notebook</p>
        </div>
        <nav aria-label="Main" className="title-nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      {fallback && (
        <div role="status" className="banner">
          Progress will not be saved in this browser
        </div>
      )}
      <main>
        <Outlet key={redraw} />
      </main>
    </div>
  )
}
