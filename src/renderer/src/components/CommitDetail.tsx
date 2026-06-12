import { useTranslation } from 'react-i18next'
import { GitCommitHorizontal } from 'lucide-react'
import { useLog } from '../hooks/useRepo'
import { useRepoStore } from '../store/repoStore'
import { DiffView } from './DiffView'

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-20 shrink-0 text-fg-subtle">{label}</span>
      <span className="min-w-0 break-words text-fg">{children}</span>
    </div>
  )
}

export function CommitDetail({ repoPath }: { repoPath: string }): React.JSX.Element {
  const { t } = useTranslation()
  // Reuses the cached log query — no extra IPC round-trip.
  const { data: commits } = useLog(repoPath, { limit: 300 })
  const selectedSha = useRepoStore((s) => s.selectedSha)
  const commit = commits?.find((c) => c.sha === selectedSha)

  if (!commit) {
    return (
      <div className="flex h-full items-center justify-center bg-surface p-6 text-center">
        <p className="max-w-[240px] text-xs text-fg-subtle">{t('detail.selectPrompt')}</p>
      </div>
    )
  }

  const date = new Date(commit.author.date).toLocaleString()

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-4 text-xs font-medium uppercase tracking-wide text-fg-muted">
        <GitCommitHorizontal size={15} strokeWidth={1.75} />
        {t('detail.title')}
      </div>

      <div className="max-h-[45%] shrink-0 overflow-auto p-4">
        <p className="mb-1 text-sm font-medium text-fg">{commit.summary}</p>
        {commit.body && (
          <pre className="mb-4 whitespace-pre-wrap font-sans text-xs text-fg-muted">
            {commit.body}
          </pre>
        )}

        <div className="space-y-1.5 border-t border-border pt-3">
          <Field label="SHA">
            <span className="font-mono">{commit.sha}</span>
          </Field>
          <Field label={t('detail.author')}>
            {commit.author.name} &lt;{commit.author.email}&gt;
          </Field>
          <Field label={t('detail.committer')}>
            {commit.committer.name} &lt;{commit.committer.email}&gt;
          </Field>
          <Field label="Date">{date}</Field>
          <Field label={t('detail.parents')}>
            {commit.parents.length === 0 ? (
              <span className="text-fg-subtle">—</span>
            ) : (
              <span className="font-mono">{commit.parents.map((p) => p.slice(0, 7)).join('  ')}</span>
            )}
          </Field>
        </div>
      </div>

      <DiffView repoPath={repoPath} sha={commit.sha} />
    </div>
  )
}
