import { useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { routes } from './routes'
import { StoreProvider } from './storage/context'

export function App() {
  const [router] = useState(() => createBrowserRouter(routes))
  return (
    <StoreProvider>
      <RouterProvider router={router} />
    </StoreProvider>
  )
}
