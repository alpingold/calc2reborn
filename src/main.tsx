import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import 'katex/dist/katex.min.css'
import '@fontsource-variable/source-sans-3/wght.css'
import '@fontsource-variable/source-sans-3/wght-italic.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
