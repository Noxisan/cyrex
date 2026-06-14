import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './i18n'
import './styles/index.css'
import { App } from './App'
import { applyAccent, applyTheme, useRepoStore } from './store/repoStore'

// Apply the persisted theme + accent before first paint.
applyTheme(useRepoStore.getState().theme)
applyAccent(useRepoStore.getState().accent)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5_000 }
  }
})

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
