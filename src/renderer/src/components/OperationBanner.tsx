import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { useAbortOperation, useContinueOperation, useStatus } from '../hooks/useRepo'

/**
 * Shown while a merge/cherry-pick/revert/rebase is in progress (typically
 * because it stopped on conflicts). Offers Continue — enabled only once all
 * conflicts are resolved/staged — and a destructive Abort.
 */
export function OperationBanner({ repoPath }: { repoPath: string }): React.JSX.Element | null {
  const { t } = useTranslation()
  const { data: status } = useStatus(repoPath)
  const cont = useContinueOperation(repoPath)
  const abort = useAbortOperation(repoPath)

  if (!status?.operation) return null

  const conflicts = status.conflicted.length
  const opName = t(`operation.${status.operation}`)

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-conflict/40 bg-conflict/10 px-4 py-1.5 text-xs">
      <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0 text-conflict" />
      <span className="text-fg">
        {t('operation.inProgress', { op: opName })}
        {conflicts > 0 && (
          <span className="ms-1 text-conflict">{t('operation.conflicts', { count: conflicts })}</span>
        )}
      </span>
      <div className="ms-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => cont.mutate(undefined)}
          disabled={conflicts > 0 || cont.isPending}
          title={conflicts > 0 ? t('operation.resolveFirst') : undefined}
          className="rounded-[var(--radius-card)] bg-accent px-2.5 py-1 font-medium text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('operation.continue')}
        </button>
        <button
          type="button"
          onClick={() => abort.mutate(undefined)}
          disabled={abort.isPending}
          className="rounded-[var(--radius-card)] bg-danger px-2.5 py-1 font-medium text-white hover:bg-danger-hover disabled:opacity-40"
        >
          {t('operation.abort')}
        </button>
      </div>
    </div>
  )
}
