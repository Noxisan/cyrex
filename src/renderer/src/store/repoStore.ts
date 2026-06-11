/**
 * UI state store. Holds only non-sensitive view state (open repos, selection,
 * theme). NO credentials or secrets are ever placed here or persisted
 * (CLAUDE.md §4). Repo lists / themes use localStorage; tokens never do.
 */

import { create } from 'zustand'
import type { RepoRef } from '@shared/types'

export type Theme = 'dark' | 'light'

interface RepoState {
  repos: RepoRef[]
  activePath: string | null
  selectedSha: string | null
  theme: Theme

  addRepo: (repo: RepoRef) => void
  setActive: (path: string | null) => void
  selectCommit: (sha: string | null) => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const REPOS_KEY = 'cyrex.repos'
const THEME_KEY = 'cyrex.theme'

function loadRepos(): RepoRef[] {
  try {
    const raw = localStorage.getItem(REPOS_KEY)
    return raw ? (JSON.parse(raw) as RepoRef[]) : []
  } catch {
    return []
  }
}

function initialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repos: loadRepos(),
  activePath: null,
  selectedSha: null,
  theme: initialTheme(),

  addRepo: (repo) =>
    set((s) => {
      const repos = [repo, ...s.repos.filter((r) => r.path !== repo.path)]
      localStorage.setItem(REPOS_KEY, JSON.stringify(repos))
      return { repos, activePath: repo.path, selectedSha: null }
    }),

  setActive: (path) => set({ activePath: path, selectedSha: null }),
  selectCommit: (sha) => set({ selectedSha: sha }),

  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },

  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
}))
