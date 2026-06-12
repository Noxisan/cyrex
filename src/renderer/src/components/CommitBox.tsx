import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitCommitHorizontal } from 'lucide-react'
import { useCommit } from '../hooks/useRepo'

export function CommitBox({
  repoPath,
  stagedCount,
  branch
}: {
  repoPath: string
  stagedCount: number
  branch: string | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const [message, setMessage] = useState('')
  const commit = useCommit(repoPath)

  const canCommit = stagedCount > 0 && message.trim().length > 0 && !commit.isPending

  function submit(): void {
    if (!canCommit) return
    commit.mutate(message.trim(), {
      onSuccess: () => setMessage('')
    })
  }

  return (
    <div className="shrink-0 border-t border-border p-2">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter commits.
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit()
        }}
        placeholder={t('changes.commitPlaceholder')}
        rows={3}
        className="w-full resize-none rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1.5 text-xs text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
      />
      {commit.isError && (
        <p className="mt-1 text-[11px] text-danger">{(commit.error as Error).message}</p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={!canCommit}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-card)] bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        <GitCommitHorizontal size={15} strokeWidth={1.75} />
        {commit.isPending
          ? t('changes.committing')
          : t('changes.commit', { count: stagedCount, branch: branch ?? 'HEAD' })}
      </button>
    </div>
  )
}
