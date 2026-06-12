import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { History, UserRound, X } from 'lucide-react'
import type { BlameLine, Commit } from '@shared/types'
import { useRepoStore } from '../store/repoStore'
import { useBlame, useFileHistory } from '../hooks/useRepo'

function fmtDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' })
}

function HistoryTab({ repoPath, file }: { repoPath: string; file: string }): React.JSX.Element {
  const { t } = useTranslation()
  const { data, isLoading, error } = useFileHistory(repoPath, file)
  const selectCommit = useRepoStore((s) => s.selectCommit)
  const setViewMode = useRepoStore((s) => s.setViewMode)
  const closeInspector = useRepoStore((s) => s.closeInspector)

  const jump = (c: Commit): void => {
    selectCommit(c.sha)
    setViewMode('history')
    closeInspector()
  }

  if (isLoading) return <p className="p-4 text-xs text-fg-subtle">{t('graph.loading')}</p>
  if (error) return <p className="p-4 text-xs text-danger">{(error as Error).message}</p>
  if (!data || data.length === 0)
    return <p className="p-4 text-xs text-fg-subtle">{t('inspector.noHistory')}</p>

  return (
    <div className="divide-y divide-border/40">
      {data.map((c) => (
        <button
          key={c.sha}
          type="button"
          onClick={() => jump(c)}
          title={t('inspector.jumpToCommit')}
          className="flex w-full items-center gap-3 px-4 py-2 text-start text-xs hover:bg-surface-2"
        >
          <span className="min-w-0 flex-1 truncate text-fg">{c.summary}</span>
          <span className="shrink-0 truncate text-fg-subtle">{c.author.name}</span>
          <span className="shrink-0 text-fg-subtle">{fmtDate(c.author.date)}</span>
          <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{c.shortSha}</span>
        </button>
      ))}
    </div>
  )
}

const LANE = ['--color-lane-0', '--color-lane-1', '--color-lane-2', '--color-lane-3', '--color-lane-4', '--color-lane-5']
function shaColor(sha: string): string {
  let h = 0
  for (let i = 0; i < sha.length; i++) h = (h * 31 + sha.charCodeAt(i)) >>> 0
  return `var(${LANE[h % LANE.length]})`
}

function BlameTab({ repoPath, file }: { repoPath: string; file: string }): React.JSX.Element {
  const { t } = useTranslation()
  const { data, isLoading, error } = useBlame(repoPath, file)

  if (isLoading) return <p className="p-4 text-xs text-fg-subtle">{t('graph.loading')}</p>
  if (error) return <p className="p-4 text-xs text-danger">{(error as Error).message}</p>
  if (!data) return <p className="p-4 text-xs text-fg-subtle">{t('diff.empty')}</p>

  return (
    <div className="font-mono text-[12px] leading-5">
      {data.map((b: BlameLine, i) => {
        const newBlock = i === 0 || data[i - 1].sha !== b.sha
        return (
          <div key={i} className="flex hover:bg-surface-2">
            <span
              className="flex w-44 shrink-0 items-center gap-1.5 border-e border-border px-2 text-[10px] text-fg-subtle"
              style={{ borderInlineStartWidth: 2, borderInlineStartColor: shaColor(b.sha) }}
              title={`${b.summary}\n${b.author} · ${fmtDate(b.date)}`}
            >
              {newBlock && (
                <>
                  <span className="text-fg-muted">{b.shortSha}</span>
                  <span className="truncate">{b.author}</span>
                </>
              )}
            </span>
            <span className="w-10 shrink-0 select-none pe-2 text-end text-fg-subtle">{b.line}</span>
            <span className="whitespace-pre pe-4 text-fg">{b.content || ' '}</span>
          </div>
        )
      })}
    </div>
  )
}

export function FileInspector(): React.JSX.Element | null {
  const { t } = useTranslation()
  const activePath = useRepoStore((s) => s.activePath)
  const file = useRepoStore((s) => s.inspectorFile)
  const tab = useRepoStore((s) => s.inspectorTab)
  const openInspector = useRepoStore((s) => s.openInspector)
  const closeInspector = useRepoStore((s) => s.closeInspector)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeInspector()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeInspector])

  if (!file || !activePath) return null

  const Tab = (
    id: 'history' | 'blame',
    label: string,
    Icon: typeof History
  ): React.JSX.Element => (
    <button
      type="button"
      onClick={() => openInspector(file, id)}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium ${
        tab === id ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'
      }`}
    >
      <Icon size={14} strokeWidth={1.75} />
      {label}
    </button>
  )

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-8"
      onMouseDown={closeInspector}
    >
      <div
        className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-2">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg" title={file}>
            {file}
          </span>
          <button
            type="button"
            onClick={closeInspector}
            className="text-fg-subtle hover:text-fg"
            aria-label={t('common.cancel')}
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1 border-b border-border px-2">
          {Tab('history', t('inspector.history'), History)}
          {Tab('blame', t('inspector.blame'), UserRound)}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {tab === 'history' ? (
            <HistoryTab repoPath={activePath} file={file} />
          ) : (
            <BlameTab repoPath={activePath} file={file} />
          )}
        </div>
      </div>
    </div>
  )
}
