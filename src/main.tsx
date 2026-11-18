import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { App } from './App'
import 'katex/dist/katex.min.css'
import '@fontsource-variable/source-sans-3/wght.css'
import '@fontsource-variable/source-sans-3/wght-italic.css'
import './styles.css'
import { applyTheme, readTheme } from './theme'

// index.html has already set the theme before the first paint; this covers a page where that script did not run
applyTheme(readTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* Vercel Web Analytics: page views only, no cookies; does nothing until it is enabled on the project */}
    <Analytics />
  </StrictMode>,
)
