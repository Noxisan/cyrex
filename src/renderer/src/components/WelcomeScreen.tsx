import { useTranslation } from 'react-i18next'
import { FolderOpen, GitGraph } from 'lucide-react'
import { useRepoStore } from '../store/repoStore'
import { useEngineInfo } from '../hooks/useRepo'

export function WelcomeScreen(): React.JSX.Element {
  const { t } = useTranslation()
  const addRepo = useRepoStore((s) => s.addRepo)
  const engine = useEngineInfo()

  async function openRepo(): Promise<void> {
    const res = await window.cyrex.openRepoDialog()
    if (res.ok && res.data) addRepo(res.data)
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-bg p-8 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-[var(--radius-card)] bg-surface">
        <GitGraph size={28} strokeWidth={1.5} className="text-accent" />
      </div>
      <h1 className="mb-1 text-lg font-semibold text-fg">{t('welcome.title')}</h1>
      <p className="mb-6 max-w-sm text-xs leading-relaxed text-fg-muted">{t('welcome.hint')}</p>
      <button
        type="button"
        onClick={openRepo}
        className="flex items-center gap-2 rounded-[var(--radius-card)] bg-accent px-4 py-2 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-hover"
      >
        <FolderOpen size={16} strokeWidth={1.75} />
        {t('actions.openRepository')}
      </button>
      {engine.data && (
        <p className="mt-8 text-[11px] text-fg-subtle">
          {t('welcome.engine', { backend: engine.data.backend, version: engine.data.version })}
        </p>
      )}
    </div>
  )
}
