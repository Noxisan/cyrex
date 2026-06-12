import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export interface ConfirmState {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}

/**
 * A modal confirmation for hard-to-reverse actions (force delete, and later
 * force-push / hard reset). Destructive actions must be explicitly confirmed
 * and clearly labeled (CLAUDE.md §3 safety rules).
 */
export function ConfirmDialog({
  state,
  onClose
}: {
  state: ConfirmState | null
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, onClose])

  if (!state) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="w-[380px] rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1.5 text-sm font-semibold text-fg">{state.title}</h2>
        <p className="mb-4 whitespace-pre-wrap text-xs leading-relaxed text-fg-muted">
          {state.message}
        </p>
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
            onClick={() => {
              onClose()
              state.onConfirm()
            }}
            className={`rounded-[var(--radius-card)] px-3 py-1.5 text-xs font-medium text-white ${
              state.danger ? 'bg-danger hover:bg-danger-hover' : 'bg-accent hover:bg-accent-hover'
            }`}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
