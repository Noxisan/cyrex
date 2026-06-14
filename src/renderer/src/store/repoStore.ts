/**
 * UI state store. Holds only non-sensitive view state (open repos, selection,
 * theme). NO credentials or secrets are ever placed here or persisted
 * (CLAUDE.md §4). Repo lists / themes use localStorage; tokens never do.
 */

import { create } from 'zustand'
import type { RepoRef } from '@shared/types'

/** The resolved, applied theme (what `data-theme` is set to). */
export type Theme = 'dark' | 'light'
/** The user's theme preference; `system` follows the OS. */
export type ThemeMode = 'dark' | 'light' | 'system'
export type ViewMode = 'history' | 'changes'

/**
 * An accent palette. Only the brand/interactive accent is themed here — danger,
 * diff and conflict colors stay fixed so meaning never blurs (CLAUDE.md §7).
 */
export interface AccentPalette {
  id: string
  label: string
  accent: string
  hover: string
}

/** Curated accent choices (crimson is the Cyrex default and stays first). */
export const ACCENTS: AccentPalette[] = [
  { id: 'crimson', label: 'Crimson', accent: '#f7374f', hover: '#ff4d63' },
  { id: 'ember', label: 'Ember', accent: '#ff5722', hover: '#ff7043' },
  { id: 'amber', label: 'Amber', accent: '#f5a524', hover: '#ffb84d' },
  { id: 'emerald', label: 'Emerald', accent: '#2ecc71', hover: '#46d784' },
  { id: 'teal', label: 'Teal', accent: '#16c5b4', hover: '#2ad8c6' },
  { id: 'azure', label: 'Azure', accent: '#3b82f6', hover: '#5a97ff' },
  { id: 'violet', label: 'Violet', accent: '#8b5cf6', hover: '#a07bff' },
  { id: 'magenta', label: 'Magenta', accent: '#e0529c', hover: '#ec6fb0' }
]

/**
 * A repo in the sidebar list. Extends the engine's RepoRef with renderer-only
 * presentation state (favorite, custom dot color). These never reach the engine;
 * the color is a CSS variable string so it follows the active theme.
 */
export interface RepoEntry extends RepoRef {
  favorite?: boolean
  color?: string
}

/** A working-tree file the user has selected to diff in the Changes view. */
export interface SelectedFile {
  file: string
  staged: boolean
  untracked: boolean
}

interface RepoState {
  repos: RepoEntry[]
  activePath: string | null
  selectedSha: string | null
  viewMode: ViewMode
  selectedFile: SelectedFile | null
  /** File path open in the history/blame inspector overlay, if any. */
  inspectorFile: string | null
  inspectorTab: 'history' | 'blame'
  /** Active commit-search query; when non-empty the graph shows results. */
  searchQuery: string
  /** Whether the reflog (undo / recovery) overlay is open. */
  reflogOpen: boolean
  /** Base commit sha for the interactive-rebase planner; null when closed. */
  rebaseBase: string | null
  /** Whether the embedded terminal pane is shown. */
  terminalOpen: boolean
  /** Whether the command palette (Cmd/Ctrl+K) overlay is open. */
  paletteOpen: boolean
  /** The unified Open Repository modal (local repos left, remote accounts right). */
  openRepoOpen: boolean
  createRepoOpen: boolean
  /** Target ref (HEAD or a sha) for the Create Tag dialog; null when closed. */
  createTagTarget: string | null
  /** The Settings dialog. */
  settingsOpen: boolean
  /** The visual .gitignore editor dialog. */
  gitignoreOpen: boolean
  /** Resolved theme currently applied to the document. */
  theme: Theme
  /** The user's theme preference (system follows the OS). */
  themeMode: ThemeMode
  /** Selected accent palette id (see ACCENTS). */
  accent: string
  /** Which view a repository opens into. */
  defaultView: ViewMode

  addRepo: (repo: RepoRef) => void
  removeRepo: (path: string) => void
  toggleFavorite: (path: string) => void
  setRepoColor: (path: string, color?: string) => void
  setActive: (path: string | null) => void
  selectCommit: (sha: string | null) => void
  setViewMode: (mode: ViewMode) => void
  selectFile: (file: SelectedFile | null) => void
  openInspector: (file: string, tab?: 'history' | 'blame') => void
  closeInspector: () => void
  setSearchQuery: (query: string) => void
  openReflog: () => void
  closeReflog: () => void
  openRebase: (base: string) => void
  closeRebase: () => void
  toggleTerminal: () => void
  togglePalette: () => void
  closePalette: () => void
  openRepoModal: () => void
  closeRepoModal: () => void
  openCreateRepo: () => void
  closeCreateRepo: () => void
  openCreateTag: (ref: string) => void
  closeCreateTag: () => void
  openSettings: () => void
  closeSettings: () => void
  openGitignore: () => void
  closeGitignore: () => void
  setThemeMode: (mode: ThemeMode) => void
  toggleTheme: () => void
  setAccent: (id: string) => void
  setDefaultView: (view: ViewMode) => void
}

const REPOS_KEY = 'cyrex.repos'
const THEME_KEY = 'cyrex.theme'
const THEME_MODE_KEY = 'cyrex.themeMode'
const ACCENT_KEY = 'cyrex.accent'
const DEFAULT_VIEW_KEY = 'cyrex.defaultView'

function loadRepos(): RepoEntry[] {
  try {
    const raw = localStorage.getItem(REPOS_KEY)
    return raw ? (JSON.parse(raw) as RepoEntry[]) : []
  } catch {
    return []
  }
}

function saveRepos(repos: RepoEntry[]): void {
  localStorage.setItem(REPOS_KEY, JSON.stringify(repos))
}

function systemPrefersLight(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false
}

/** Resolve a preference to the concrete theme to apply. */
function resolveTheme(mode: ThemeMode): Theme {
  if (mode === 'system') return systemPrefersLight() ? 'light' : 'dark'
  return mode
}

function initialThemeMode(): ThemeMode {
  const stored = localStorage.getItem(THEME_MODE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  // Migrate a legacy explicit dark/light choice; otherwise follow the OS.
  const legacy = localStorage.getItem(THEME_KEY)
  if (legacy === 'light' || legacy === 'dark') return legacy
  return 'system'
}

function initialAccent(): AccentPalette {
  const id = localStorage.getItem(ACCENT_KEY)
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0]
}

function initialDefaultView(): ViewMode {
  return localStorage.getItem(DEFAULT_VIEW_KEY) === 'changes' ? 'changes' : 'history'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

/** Override the accent CSS variables (the rest of the palette is fixed). */
export function applyAccent(id: string): void {
  const p = ACCENTS.find((a) => a.id === id) ?? ACCENTS[0]
  const root = document.documentElement
  root.style.setProperty('--color-accent', p.accent)
  root.style.setProperty('--color-accent-hover', p.hover)
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repos: loadRepos(),
  activePath: null,
  selectedSha: null,
  viewMode: 'history',
  selectedFile: null,
  inspectorFile: null,
  inspectorTab: 'history',
  searchQuery: '',
  reflogOpen: false,
  rebaseBase: null,
  terminalOpen: false,
  paletteOpen: false,
  openRepoOpen: false,
  createRepoOpen: false,
  createTagTarget: null,
  settingsOpen: false,
  gitignoreOpen: false,
  theme: resolveTheme(initialThemeMode()),
  themeMode: initialThemeMode(),
  accent: initialAccent().id,
  defaultView: initialDefaultView(),

  addRepo: (repo) =>
    set((s) => {
      // Preserve any existing favorite/color when re-opening a known repo.
      const prev = s.repos.find((r) => r.path === repo.path)
      const entry: RepoEntry = { ...repo, favorite: prev?.favorite, color: prev?.color }
      const repos = [entry, ...s.repos.filter((r) => r.path !== repo.path)]
      saveRepos(repos)
      return {
        repos,
        activePath: repo.path,
        selectedSha: null,
        selectedFile: null,
        viewMode: s.defaultView
      }
    }),

  removeRepo: (path) =>
    set((s) => {
      const repos = s.repos.filter((r) => r.path !== path)
      saveRepos(repos)
      // Drop selection if the removed repo was the active one.
      if (s.activePath !== path) return { repos }
      return { repos, activePath: null, selectedSha: null, selectedFile: null, searchQuery: '' }
    }),

  toggleFavorite: (path) =>
    set((s) => {
      const repos = s.repos.map((r) =>
        r.path === path ? { ...r, favorite: !r.favorite } : r
      )
      saveRepos(repos)
      return { repos }
    }),

  setRepoColor: (path, color) =>
    set((s) => {
      const repos = s.repos.map((r) => (r.path === path ? { ...r, color } : r))
      saveRepos(repos)
      return { repos }
    }),

  setActive: (path) =>
    set((s) => ({
      activePath: path,
      viewMode: s.defaultView,
      selectedSha: null,
      selectedFile: null,
      inspectorFile: null,
      searchQuery: '',
      reflogOpen: false,
      rebaseBase: null
    })),
  selectCommit: (sha) => set({ selectedSha: sha }),
  setViewMode: (mode) => set({ viewMode: mode }),
  selectFile: (file) => set({ selectedFile: file }),
  openInspector: (file, tab = 'history') => set({ inspectorFile: file, inspectorTab: tab }),
  closeInspector: () => set({ inspectorFile: null }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  openReflog: () => set({ reflogOpen: true }),
  closeReflog: () => set({ reflogOpen: false }),
  openRebase: (base) => set({ rebaseBase: base }),
  closeRebase: () => set({ rebaseBase: null }),
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  closePalette: () => set({ paletteOpen: false }),
  openRepoModal: () => set({ openRepoOpen: true }),
  closeRepoModal: () => set({ openRepoOpen: false }),
  openCreateRepo: () => set({ createRepoOpen: true }),
  closeCreateRepo: () => set({ createRepoOpen: false }),
  openCreateTag: (ref) => set({ createTagTarget: ref }),
  closeCreateTag: () => set({ createTagTarget: null }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  openGitignore: () => set({ gitignoreOpen: true }),
  closeGitignore: () => set({ gitignoreOpen: false }),

  setThemeMode: (mode) => {
    localStorage.setItem(THEME_MODE_KEY, mode)
    const theme = resolveTheme(mode)
    applyTheme(theme)
    set({ themeMode: mode, theme })
  },

  // Quick toggle (topbar / palette): pick an explicit mode opposite to current.
  toggleTheme: () => get().setThemeMode(get().theme === 'dark' ? 'light' : 'dark'),

  setAccent: (id) => {
    localStorage.setItem(ACCENT_KEY, id)
    applyAccent(id)
    set({ accent: id })
  },

  setDefaultView: (view) => {
    localStorage.setItem(DEFAULT_VIEW_KEY, view)
    set({ defaultView: view })
  }
}))

// When following the OS theme, react to live changes (e.g. day/night switch).
window
  .matchMedia?.('(prefers-color-scheme: light)')
  .addEventListener?.('change', () => {
    const { themeMode } = useRepoStore.getState()
    if (themeMode !== 'system') return
    const theme = resolveTheme('system')
    applyTheme(theme)
    useRepoStore.setState({ theme })
  })
