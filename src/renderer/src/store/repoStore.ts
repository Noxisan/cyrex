/**
 * UI state store. Holds only non-sensitive view state (open repos, selection,
 * theme). NO credentials or secrets are ever placed here or persisted
 * (CLAUDE.md §4). Repo lists / themes use localStorage; tokens never do.
 */

import { create } from 'zustand'
import type { RepoRef } from '@shared/types'

export type Theme = 'dark' | 'light'
export type ViewMode = 'history' | 'changes'

/** A working-tree file the user has selected to diff in the Changes view. */
export interface SelectedFile {
  file: string
  staged: boolean
  untracked: boolean
}

interface RepoState {
  repos: RepoRef[]
  activePath: string | null
  selectedSha: string | null
  viewMode: ViewMode
  selectedFile: SelectedFile | null
  /** File path open in the history/blame inspector overlay, if any. */
  inspectorFile: string | null
  inspectorTab: 'history' | 'blame'
  theme: Theme

  addRepo: (repo: RepoRef) => void
  setActive: (path: string | null) => void
  selectCommit: (sha: string | null) => void
  setViewMode: (mode: ViewMode) => void
  selectFile: (file: SelectedFile | null) => void
  openInspector: (file: string, tab?: 'history' | 'blame') => void
  closeInspector: () => void
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
  viewMode: 'history',
  selectedFile: null,
  inspectorFile: null,
  inspectorTab: 'history',
  theme: initialTheme(),

  addRepo: (repo) =>
    set((s) => {
      const repos = [repo, ...s.repos.filter((r) => r.path !== repo.path)]
      localStorage.setItem(REPOS_KEY, JSON.stringify(repos))
      return { repos, activePath: repo.path, selectedSha: null, selectedFile: null }
    }),

  setActive: (path) =>
    set({ activePath: path, selectedSha: null, selectedFile: null, inspectorFile: null }),
  selectCommit: (sha) => set({ selectedSha: sha }),
  setViewMode: (mode) => set({ viewMode: mode }),
  selectFile: (file) => set({ selectedFile: file }),
  openInspector: (file, tab = 'history') => set({ inspectorFile: file, inspectorTab: tab }),
  closeInspector: () => set({ inspectorFile: null }),

  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },

  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
}))
