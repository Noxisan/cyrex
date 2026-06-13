import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History, RotateCcw, X } from 'lucide-react'
import type { ReflogEntry } from '@shared/types'
import { useRepoStore } from '../store/repoStore'
import { useReflog, useResetTo } from '../hooks/useRepo'
import { ContextMenu } from './ContextMenu'
import type { MenuState } from './ContextMenu'
import { ConfirmDialog } from './ConfirmDialog'
import type { ConfirmState } from './ConfirmDialog'

function fmtDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** Colour the action verb so commit / reset / checkout read apart at a glance. */
function actionTone(action: string): string {
  const a = action.toLowerCase()
  if (a.startsWith('reset') || a.startsWith('rebase')) return 'bg-conflict/15 text-conflict'
  if (a.startsWith('commit')) return 'bg-accent/15 text-accent'
  return 'bg-surface-2 text-fg-muted'
}

function Row({
  entry,
  onRestore
}: {
  entry: ReflogEntry
  onRestore: (e: React.MouseEvent, entry: ReflogEntry) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="group flex items-center gap-3 px-4 py-2 text-xs hover:bg-surface-2">
      <span className="w-20 shrink-0 truncate font-mono text-[11px] text-fg-subtle">
        {entry.selector}
      </span>
      <span
        className={`shrink-0 rounded-[var(--radius-card)] px-1.5 py-0.5 text-[10px] font-medium ${actionTone(
          entry.action
        )}`}
      >
        {entry.action}
      </span>
      <span className="min-w-0 flex-1 truncate text-fg" title={entry.message}>
        {entry.message || entry.action}
      </span>
      <span className="shrink-0 text-fg-subtle">{fmtDate(entry.date)}</span>
      <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{entry.shortSha}</span>
      <button
        type="button"
        onClick={(e) => onRestore(e, entry)}
        title={t('reflog.restore')}
        className="shrink-0 rounded-[var(--radius-card)] p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-surface hover:text-fg group-hover:opacity-100"
      >
        <RotateCcw size={14} strokeWidth={1.75} />
      </button>
    </div>
  )
}

export function ReflogPanel(): React.JSX.Element | null {
  const { t } = useTranslation()
  const activePath = useRepoStore((s) => s.activePath)
  const open = useRepoStore((s) => s.reflogOpen)
  const closeReflog = useRepoStore((s) => s.closeReflog)
  const { data, isLoading, error } = useReflog(activePath, open)
  const reset = useResetTo(activePath ?? '')
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeReflog()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeReflog])

  if (!open || !activePath) return null

  // soft / mixed keep file contents and are recoverable via the reflog, so they
  // run directly; hard discards working changes and is gated behind a confirm.
  const restoreMenu = (e: React.MouseEvent, entry: ReflogEntry): void => {
    e.preventDefault()
    const label = `${entry.shortSha} · ${entry.message || entry.action}`
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: t('reflog.resetSoft'),
          onClick: () => reset.mutate({ sha: entry.sha, mode: 'soft' })
        },
        {
          label: t('reflog.resetMixed'),
          onClick: () => reset.mutate({ sha: entry.sha, mode: 'mixed' })
        },
        {
          label: t('reflog.resetHard'),
          danger: true,
          onClick: () =>
            setConfirm({
              title: t('reflog.resetHard'),
              message: t('reflog.resetHardMessage', { target: label }),
              confirmLabel: t('reflog.resetHard'),
              danger: true,
              onConfirm: () => {
                reset.mutate({ sha: entry.sha, mode: 'hard' })
                closeReflog()
              }
            })
        }
      ]
    })
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-8"
      onMouseDown={closeReflog}
    >
      <div
        className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <History size={15} strokeWidth={1.75} className="text-fg-muted" />
          <span className="text-sm font-semibold text-fg">{t('reflog.title')}</span>
          <span className="text-xs text-fg-subtle">{t('reflog.subtitle')}</span>
          <button
            type="button"
            onClick={closeReflog}
            className="ms-auto text-fg-subtle hover:text-fg"
            aria-label={t('common.cancel')}
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {isLoading && <p className="p-4 text-xs text-fg-subtle">{t('graph.loading')}</p>}
          {error && <p className="p-4 text-xs text-danger">{(error as Error).message}</p>}
          {data && data.length === 0 && (
            <p className="p-4 text-xs text-fg-subtle">{t('reflog.empty')}</p>
          )}
          <div className="divide-y divide-border/40">
            {data?.map((entry) => (
              <Row key={entry.selector} entry={entry} onRestore={restoreMenu} />
            ))}
          </div>
        </div>
      </div>
      <ContextMenu state={menu} onClose={() => setMenu(null)} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
