import { Link } from 'react-router'

export function NotFound() {
  return (
    <>
      <h2>Not found</h2>
      <p>
        That page does not exist. <Link to="/">Back to the dashboard</Link>
      </p>
    </>
  )
}
