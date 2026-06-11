import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Check, GitBranch } from 'lucide-react'
import { useRepoStore } from '../store/repoStore'
import { useEngineInfo, useStatus } from '../hooks/useRepo'

export function StatusBar(): React.JSX.Element {
  const { t } = useTranslation()
  const activePath = useRepoStore((s) => s.activePath)
  const status = useStatus(activePath)
  const engine = useEngineInfo()

  const s = status.data
  const changeCount =
    (s?.staged.length ?? 0) +
    (s?.unstaged.length ?? 0) +
    (s?.untracked.length ?? 0) +
    (s?.conflicted.length ?? 0)

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-border bg-surface px-3 text-[11px] text-fg-muted">
      {s && (
        <>
          <span className="flex items-center gap-1">
            <GitBranch size={12} strokeWidth={1.75} />
            {s.branch ?? t('status.detached')}
          </span>
          {s.ahead > 0 && (
            <span className="flex items-center gap-0.5">
              <ArrowUp size={11} />
              {s.ahead}
            </span>
          )}
          {s.behind > 0 && (
            <span className="flex items-center gap-0.5">
              <ArrowDown size={11} />
              {s.behind}
            </span>
          )}
          <span className="text-border">|</span>
          {s.clean ? (
            <span className="flex items-center gap-1 text-diff-add">
              <Check size={12} strokeWidth={2} />
              {t('status.clean')}
            </span>
          ) : (
            <span>
              {changeCount} {t('status.unstaged').toLowerCase()}
              {s.conflicted.length > 0 && (
                <span className="ms-2 text-conflict">
                  {s.conflicted.length} {t('status.conflicted').toLowerCase()}
                </span>
              )}
            </span>
          )}
        </>
      )}

      <span className="ms-auto text-fg-subtle">
        {engine.data ? `${engine.data.backend} · ${engine.data.version}` : ''}
      </span>
    </footer>
  )
}
