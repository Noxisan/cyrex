import { useTranslation } from 'react-i18next'
import { GitGraph, FilePen } from 'lucide-react'
import { useRepoStore } from '../store/repoStore'
import { useStatus } from '../hooks/useRepo'

export function ViewTabs(): React.JSX.Element {
  const { t } = useTranslation()
  const activePath = useRepoStore((s) => s.activePath)
  const viewMode = useRepoStore((s) => s.viewMode)
  const setViewMode = useRepoStore((s) => s.setViewMode)
  const status = useStatus(activePath)

  const s = status.data
  const changeCount = s
    ? s.staged.length + s.unstaged.length + s.untracked.length + s.conflicted.length
    : 0

  const tab = (
    mode: 'history' | 'changes',
    label: string,
    Icon: typeof GitGraph,
    badge?: number
  ): React.JSX.Element => {
    const active = viewMode === mode
    return (
      <button
        type="button"
        onClick={() => setViewMode(mode)}
        className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
          active
            ? 'border-accent text-fg'
            : 'border-transparent text-fg-muted hover:text-fg'
        }`}
      >
        <Icon size={14} strokeWidth={1.75} />
        {label}
        {badge !== undefined && badge > 0 && (
          <span className="rounded-[var(--radius-card)] bg-surface-2 px-1.5 text-[10px] text-fg-muted">
            {badge}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-surface px-2">
      {tab('history', t('tabs.history'), GitGraph)}
      {tab('changes', t('tabs.changes'), FilePen, changeCount)}
    </div>
  )
}
