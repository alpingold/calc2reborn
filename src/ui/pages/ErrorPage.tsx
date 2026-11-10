import { useRouteError } from 'react-router'

/** Shown in place of the app when a screen throws while rendering. */
export function ErrorPage() {
  const error = useRouteError()
  const detail = error instanceof Error ? error.message : ''
  return (
    <section className="error-page" role="alert">
      <h1>Something went wrong</h1>
      <p>Your progress is safe. Reload the page to continue.</p>
      {detail && <p className="panel-hint">{detail}</p>}
      <button type="button" className="primary" onClick={() => window.location.reload()}>
        Reload
      </button>
    </section>
  )
}
