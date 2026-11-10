import { useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { routes } from './routes'
import { StoreProvider } from './storage/context'
import { SyncProvider } from './sync/context'

export function App() {
  const [router] = useState(() => createBrowserRouter(routes))
  return (
    <StoreProvider>
      <SyncProvider>
        <RouterProvider router={router} />
      </SyncProvider>
    </StoreProvider>
  )
}
