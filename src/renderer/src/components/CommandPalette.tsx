import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Archive,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  History,
  Moon,
  RefreshCw,
  TerminalSquare,
  Undo2
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRepoStore } from '../store/repoStore'
import { useBranches, useCheckout, useFetch, usePull, usePush, useStashSave } from '../hooks/useRepo'

interface Command {
  id: string
  group: string
  label: string
  icon: LucideIcon
  /** Extra text matched by the filter but not shown. */
  keywords?: string
  run: () => void
}

/**
 * Keyboard-first command palette (Cmd/Ctrl+K). It owns the global open shortcut
 * and stays mounted (rendering null when closed) so the listener is always live.
 * Commands map 1:1 to existing store actions and engine hooks — the palette adds
 * no new capability, only a faster way to reach what the UI already exposes.
 */
export function CommandPalette(): React.JSX.Element | null {
  const { t } = useTranslation()
  const open = useRepoStore((s) => s.paletteOpen)
  const togglePalette = useRepoStore((s) => s.togglePalette)
  const closePalette = useRepoStore((s) => s.closePalette)
  const activePath = useRepoStore((s) => s.activePath)
  const setViewMode = useRepoStore((s) => s.setViewMode)
  const openReflog = useRepoStore((s) => s.openReflog)
  const toggleTerminal = useRepoStore((s) => s.toggleTerminal)
  const toggleTheme = useRepoStore((s) => s.toggleTheme)
  const addRepo = useRepoStore((s) => s.addRepo)

  const { data: branches } = useBranches(activePath)
  const checkout = useCheckout(activePath ?? '')
  const fetch = useFetch(activePath ?? '')
  const pull = usePull(activePath ?? '')
  const push = usePush(activePath ?? '')
  const stashSave = useStashSave(activePath ?? '')

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Global open/close shortcut. Mounted always, so this is the app's Cmd/Ctrl+K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        togglePalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePalette])

  // Reset the query and selection each time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  const hasRepo = !!activePath

  const commands = useMemo<Command[]>(() => {
    const nav = t('palette.group.navigation')
    const repo = t('palette.group.repository')
    const view = t('palette.group.view')
    const branchGroup = t('palette.group.branches')

    const openRepository = async (): Promise<void> => {
      const res = await window.cyrex.openRepoDialog()
      if (res.ok && res.data) addRepo(res.data)
    }
    // Built group-contiguous (the renderer prints a header on each group change).
    const list: Command[] = []
    if (hasRepo) {
      list.push(
        { id: 'nav-history', group: nav, label: t('palette.goHistory'), icon: History, keywords: 'graph commits', run: () => setViewMode('history') },
        { id: 'nav-changes', group: nav, label: t('palette.goChanges'), icon: GitCommitHorizontal, keywords: 'staging commit', run: () => setViewMode('changes') }
      )
    }
    list.push({
      id: 'open-repo',
      group: repo,
      label: t('actions.openRepository'),
      icon: FolderOpen,
      run: () => void openRepository()
    })
    if (hasRepo) {
      list.push(
        { id: 'fetch', group: repo, label: t('actions.fetch'), icon: RefreshCw, run: () => fetch.mutate(undefined) },
        { id: 'pull', group: repo, label: t('actions.pull'), icon: ArrowDownToLine, run: () => pull.mutate(undefined) },
        { id: 'push', group: repo, label: t('actions.push'), icon: ArrowUpFromLine, run: () => push.mutate(false) },
        { id: 'stash', group: repo, label: t('palette.stashQuick'), icon: Archive, keywords: 'wip save', run: () => stashSave.mutate(undefined) },
        { id: 'undo', group: repo, label: t('palette.openUndo'), icon: Undo2, keywords: 'reflog recover history', run: openReflog }
      )
    }
    list.push({ id: 'theme', group: view, label: t('palette.toggleTheme'), icon: Moon, keywords: 'dark light', run: toggleTheme })
    if (hasRepo) {
      list.push({
        id: 'terminal',
        group: view,
        label: t('palette.toggleTerminal'),
        icon: TerminalSquare,
        keywords: 'shell console',
        run: toggleTerminal
      })
      for (const b of branches ?? []) {
        if (b.kind !== 'local' || b.current) continue
        list.push({
          id: `checkout-${b.name}`,
          group: branchGroup,
          label: t('palette.checkout', { name: b.name }),
          icon: GitBranch,
          keywords: 'switch ' + b.name,
          run: () => checkout.mutate(b.name)
        })
      }
    }
    return list
  }, [hasRepo, branches, t])

  const filtered = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return commands
    return commands.filter((c) => {
      const hay = `${c.label} ${c.keywords ?? ''} ${c.group}`.toLowerCase()
      return tokens.every((tok) => hay.includes(tok))
    })
  }, [commands, query])

  // Keep the active index in range as the filtered set shrinks.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  if (!open) return null

  const run = (cmd: Command): void => {
    closePalette()
    cmd.run()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = filtered[active]
      if (cmd) run(cmd)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closePalette()
    }
  }

  // Group consecutive runs for headers while keeping one flat index for nav.
  let lastGroup: string | null = null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 pt-[12vh]"
      onMouseDown={closePalette}
    >
      <div
        className="flex max-h-[60vh] w-[560px] flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          placeholder={t('palette.placeholder')}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          className="shrink-0 border-b border-border bg-transparent px-4 py-3 text-sm text-fg outline-none placeholder:text-fg-subtle"
        />
        <div ref={listRef} className="min-h-0 flex-1 overflow-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-fg-subtle">
              {t('palette.noResults')}
            </div>
          )}
          {filtered.map((cmd, i) => {
            const showHeader = cmd.group !== lastGroup
            lastGroup = cmd.group
            const Icon = cmd.icon
            const isActive = i === active
            return (
              <div key={cmd.id}>
                {showHeader && (
                  <div className="px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
                    {cmd.group}
                  </div>
                )}
                <button
                  type="button"
                  ref={isActive ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(cmd)}
                  className={`flex w-full items-center gap-2.5 px-4 py-1.5 text-start text-xs ${
                    isActive ? 'bg-surface-2 text-fg' : 'text-fg-muted'
                  }`}
                >
                  <Icon size={15} strokeWidth={1.75} className="shrink-0 text-fg-subtle" />
                  <span className="truncate">{cmd.label}</span>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
