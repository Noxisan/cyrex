import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitCommitHorizontal, PenLine, ShieldCheck } from 'lucide-react'
import { useCommit, useCommitContext } from '../hooks/useRepo'

function Check({
  checked,
  onChange,
  label,
  icon: Icon,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  icon: typeof PenLine
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
      className={`flex items-center gap-1 rounded-[var(--radius-card)] px-1.5 py-0.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
      }`}
    >
      <Icon size={12} strokeWidth={2} />
      {label}
    </button>
  )
}

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
  const [amend, setAmend] = useState(false)
  const [sign, setSign] = useState(false)
  const commit = useCommit(repoPath)
  const { data: ctx } = useCommitContext(repoPath)

  // Default the sign toggle to the user's git config once it loads.
  useEffect(() => {
    if (ctx) setSign(ctx.signByDefault)
  }, [ctx])

  // Amending replaces HEAD, so seed the editor with its message; turning amend
  // back off clears that seed if the user hasn't typed over it.
  const toggleAmend = (next: boolean): void => {
    setAmend(next)
    if (next) {
      if (message.trim().length === 0) setMessage(ctx?.headMessage ?? '')
    } else if (message === (ctx?.headMessage ?? '')) {
      setMessage('')
    }
  }

  // A normal commit needs staged changes; an amend can just reword HEAD.
  const canCommit =
    message.trim().length > 0 && !commit.isPending && (amend ? !!ctx?.hasHead : stagedCount > 0)

  function submit(): void {
    if (!canCommit) return
    commit.mutate(
      { message: message.trim(), amend, sign },
      {
        onSuccess: () => {
          setMessage('')
          setAmend(false)
        }
      }
    )
  }

  const label = commit.isPending
    ? amend
      ? t('changes.amending')
      : t('changes.committing')
    : amend
      ? t('changes.amendCommit')
      : t('changes.commit', { count: stagedCount, branch: branch ?? 'HEAD' })

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

      <div className="mt-1.5 flex items-center gap-1.5">
        <Check
          checked={amend}
          onChange={toggleAmend}
          disabled={!ctx?.hasHead}
          label={t('changes.amend')}
          icon={PenLine}
        />
        {ctx?.signingConfigured && (
          <Check checked={sign} onChange={setSign} label={t('changes.sign')} icon={ShieldCheck} />
        )}
        {amend && <span className="ms-auto text-[10px] text-fg-subtle">{t('changes.amendHint')}</span>}
      </div>

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
        {label}
      </button>
    </div>
  )
}
