import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitCommitHorizontal, PenLine, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react'
import { useCommit, useCommitContext } from '../hooks/useRepo'
import {
  COMMIT_TYPES,
  composeConventional,
  conventionalHeader,
  type CommitType
} from '../lib/conventionalCommit'

const CC_KEY = 'cyrex.conventionalCommits'

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
  // Conventional Commit helper (persisted preference); hidden while amending.
  const [cc, setCc] = useState(() => localStorage.getItem(CC_KEY) === '1')
  const [ccType, setCcType] = useState<CommitType>('feat')
  const [ccScope, setCcScope] = useState('')
  const [ccBreaking, setCcBreaking] = useState(false)
  const commit = useCommit(repoPath)
  const { data: ctx } = useCommitContext(repoPath)

  const ccActive = cc && !amend

  // Default the sign toggle to the user's git config once it loads.
  useEffect(() => {
    if (ctx) setSign(ctx.signByDefault)
  }, [ctx])

  const toggleCc = (next: boolean): void => {
    setCc(next)
    localStorage.setItem(CC_KEY, next ? '1' : '0')
  }

  // In helper mode the first line of the textarea is the subject.
  const subject = message.split('\n')[0]?.trim() ?? ''
  const ccPreview = conventionalHeader({
    type: ccType,
    scope: ccScope,
    breaking: ccBreaking,
    subject: subject || ''
  })

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

  // A normal commit needs staged changes; an amend can just reword HEAD. In
  // helper mode the subject (first line) is what must be non-empty.
  const hasText = ccActive ? subject.length > 0 : message.trim().length > 0
  const canCommit =
    hasText && !commit.isPending && (amend ? !!ctx?.hasHead : stagedCount > 0)

  function submit(): void {
    if (!canCommit) return
    const finalMessage = ccActive
      ? composeConventional({ type: ccType, scope: ccScope, breaking: ccBreaking, message })
      : message.trim()
    commit.mutate(
      { message: finalMessage, amend, sign },
      {
        onSuccess: () => {
          setMessage('')
          setAmend(false)
          setCcScope('')
          setCcBreaking(false)
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
      {ccActive && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <select
            value={ccType}
            onChange={(e) => setCcType(e.target.value as CommitType)}
            aria-label={t('cc.type')}
            className="rounded-[var(--radius-card)] border border-border bg-bg px-1.5 py-1 font-mono text-[11px] text-accent outline-none focus:border-accent"
          >
            {COMMIT_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {ty}
              </option>
            ))}
          </select>
          <input
            value={ccScope}
            onChange={(e) => setCcScope(e.target.value)}
            placeholder={t('cc.scopePlaceholder')}
            aria-label={t('cc.scope')}
            className="min-w-0 flex-1 rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1 font-mono text-[11px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
          />
          <button
            type="button"
            onClick={() => setCcBreaking((b) => !b)}
            aria-pressed={ccBreaking}
            title={t('cc.breakingHint')}
            className={`flex items-center gap-1 rounded-[var(--radius-card)] px-1.5 py-1 text-[11px] transition-colors ${
              ccBreaking ? 'bg-danger/15 text-danger' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
            }`}
          >
            <TriangleAlert size={12} strokeWidth={2} />
            {t('cc.breaking')}
          </button>
        </div>
      )}

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter commits.
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit()
        }}
        placeholder={ccActive ? t('cc.summaryPlaceholder') : t('changes.commitPlaceholder')}
        rows={3}
        className="w-full resize-none rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1.5 text-xs text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
      />

      {ccActive && (
        <p className="mt-1 truncate font-mono text-[11px] text-fg-subtle" title={ccPreview}>
          {subject ? ccPreview : <span className="italic">{t('cc.previewEmpty')}</span>}
        </p>
      )}

      <div className="mt-1.5 flex items-center gap-1.5">
        <Check
          checked={cc}
          onChange={toggleCc}
          disabled={amend}
          label={t('cc.enable')}
          icon={Sparkles}
        />
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
