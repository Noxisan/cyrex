import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface PromptState {
  title: string
  placeholder?: string
  initial?: string
  confirmLabel: string
  /** When false, the confirm button is enabled even with an empty value. */
  requireValue?: boolean
  onSubmit: (value: string) => void
}

/** A modal single-line text prompt (e.g. a stash message). */
export function PromptDialog({
  state,
  onClose
}: {
  state: PromptState | null
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const [value, setValue] = useState('')

  useEffect(() => {
    setValue(state?.initial ?? '')
  }, [state])

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, onClose])

  if (!state) return null

  const canSubmit = state.requireValue === false || value.trim().length > 0
  const submit = (): void => {
    if (!canSubmit) return
    onClose()
    state.onSubmit(value.trim())
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="w-[400px] rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-sm font-semibold text-fg">{state.title}</h2>
        <input
          autoFocus
          value={value}
          placeholder={state.placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          className="mb-4 w-full rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1.5 text-xs text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
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
            disabled={!canSubmit}
            className="rounded-[var(--radius-card)] bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
