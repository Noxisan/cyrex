import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EyeOff } from 'lucide-react'
import { useGitignore, useIgnorePreview, useWriteGitignore } from '../hooks/useRepo'
import { useRepoStore } from '../store/repoStore'

/**
 * Visual `.gitignore` editor. The left pane edits the file as plain text; the
 * right pane shows a live preview of which untracked files the current rules
 * would hide, computed by git itself (debounced as you type). Saving writes the
 * file and refreshes the working-tree status.
 */
export function GitignoreDialog(): React.JSX.Element | null {
  const { t } = useTranslation()
  const open = useRepoStore((s) => s.gitignoreOpen)
  const activePath = useRepoStore((s) => s.activePath)
  const close = useRepoStore((s) => s.closeGitignore)

  const path = activePath ?? ''
  const saved = useGitignore(activePath, open)
  const write = useWriteGitignore(path)
  const [content, setContent] = useState('')
  // Debounced copy of `content` that drives the preview query.
  const [debounced, setDebounced] = useState('')
  const preview = useIgnorePreview(activePath, debounced, open)

  // Load the saved file into the editor whenever the dialog opens or it loads.
  useEffect(() => {
    // Re-seed only when the dialog opens or the saved file (re)loads.
    if (open && saved.data !== undefined) {
      setContent(saved.data)
      setDebounced(saved.data)
    }
  }, [open, saved.data])

  useEffect(() => {
    const id = setTimeout(() => setDebounced(content), 300)
    return () => clearTimeout(id)
  }, [content])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  if (!open || !activePath) return null

  const dirty = content !== saved.data
  const matched = preview.data ?? []

  function save(): void {
    write.mutate(content, { onSuccess: () => close() })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={close}
    >
      <div
        className="flex h-[560px] w-[760px] flex-col rounded-[var(--radius-card)] border border-border bg-surface shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <EyeOff size={15} strokeWidth={1.75} className="text-fg-muted" />
          <h2 className="text-sm font-semibold text-fg">{t('ignore.title')}</h2>
          <code className="ms-1 truncate font-mono text-[11px] text-fg-subtle">.gitignore</code>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col border-r border-border">
            <label className="px-4 pt-3 text-[11px] uppercase tracking-wide text-fg-muted">
              {t('ignore.rules')}
            </label>
            <textarea
              autoFocus
              spellCheck={false}
              value={content}
              placeholder={t('ignore.placeholder')}
              onChange={(e) => setContent(e.target.value)}
              className="m-3 mt-2 min-h-0 flex-1 resize-none rounded-[var(--radius-card)] border border-border bg-bg p-3 font-mono text-xs leading-relaxed text-fg outline-none focus:border-accent"
            />
          </div>

          <div className="flex w-[300px] shrink-0 flex-col">
            <div className="flex items-baseline gap-2 px-4 pt-3">
              <span className="text-[11px] uppercase tracking-wide text-fg-muted">
                {t('ignore.preview')}
              </span>
              <span className="text-[11px] text-fg-subtle">
                {t('ignore.matchCount', { count: matched.length })}
              </span>
            </div>
            <div className="m-3 mt-2 min-h-0 flex-1 overflow-y-auto rounded-[var(--radius-card)] border border-border bg-bg p-2">
              {matched.length === 0 ? (
                <p className="p-2 text-xs text-fg-subtle">{t('ignore.noMatches')}</p>
              ) : (
                matched.map((f) => (
                  <div key={f} className="truncate px-1 py-0.5 font-mono text-[11px] text-fg-muted" title={f}>
                    {f}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-[11px] text-fg-subtle">{t('ignore.hint')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-[var(--radius-card)] px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || write.isPending}
              className="rounded-[var(--radius-card)] bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-40"
            >
              {t('ignore.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
