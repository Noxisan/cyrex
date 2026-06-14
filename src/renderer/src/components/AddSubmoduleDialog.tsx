import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSubmoduleAdd } from '../hooks/useRepo'

/**
 * Add a submodule: a clone URL and a repo-relative path to check it out into.
 * The path must not already exist (git creates it). Cloning is a network
 * operation, so the dialog stays open until it resolves.
 */
export function AddSubmoduleDialog({
  repoPath,
  onClose
}: {
  repoPath: string
  onClose: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const add = useSubmoduleAdd(repoPath)
  const [url, setUrl] = useState('')
  const [subPath, setSubPath] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Default the path from the repo name in the URL the first time a URL is set.
  function onUrlChange(value: string): void {
    setUrl(value)
    if (!subPath.trim()) {
      const name = value
        .replace(/\.git$/, '')
        .split(/[/:]/)
        .pop()
      if (name) setSubPath(name.replace(/[^a-zA-Z0-9._-]+/g, '-'))
    }
  }

  const canSubmit = url.trim().length > 0 && subPath.trim().length > 0

  function submit(): void {
    if (!canSubmit) return
    add.mutate(
      { url: url.trim(), subPath: subPath.trim() },
      { onSuccess: () => onClose() }
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="w-[440px] rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-sm font-semibold text-fg">{t('submodule.addTitle')}</h2>

        <label className="mb-1 block text-xs text-fg-muted">{t('submodule.url')}</label>
        <input
          autoFocus
          value={url}
          placeholder={t('submodule.urlPlaceholder')}
          onChange={(e) => onUrlChange(e.target.value)}
          className="mb-3 w-full rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1.5 font-mono text-xs text-fg outline-none focus:border-accent"
        />

        <label className="mb-1 block text-xs text-fg-muted">{t('submodule.path')}</label>
        <input
          value={subPath}
          placeholder={t('submodule.pathPlaceholder')}
          onChange={(e) => setSubPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          className="mb-4 w-full rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1.5 font-mono text-xs text-fg outline-none focus:border-accent"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-card)] px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || add.isPending}
            className="rounded-[var(--radius-card)] bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-40"
          >
            {add.isPending ? t('submodule.adding') : t('common.add')}
          </button>
        </div>
      </div>
    </div>
  )
}
