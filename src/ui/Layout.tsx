import { NavLink, Outlet } from 'react-router'
import { useStorageFallback } from '../storage/context'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/course', label: 'Course' },
  { to: '/review', label: 'Review' },
  { to: '/practice', label: 'Practice' },
  { to: '/exams', label: 'Exams' },
  { to: '/settings', label: 'Settings' },
]

export function Layout() {
  const fallback = useStorageFallback()
  return (
    <div className="app">
      <header className="app-header">
        <h1>MA 16200</h1>
        <nav aria-label="Main">
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
        <Outlet />
      </main>
    </div>
  )
}
