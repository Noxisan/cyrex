import { useEffect } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useToastStore } from '../store/toastStore'
import type { Toast } from '../store/toastStore'

const ICON = { error: AlertCircle, success: CheckCircle2, info: Info }
const ACCENT = {
  error: 'border-danger text-danger',
  success: 'border-diff-add text-diff-add',
  info: 'border-border text-fg-muted'
}

function ToastRow({ toast }: { toast: Toast }): React.JSX.Element {
  const dismiss = useToastStore((s) => s.dismiss)
  const Icon = ICON[toast.kind]

  useEffect(() => {
    // Errors linger longer so they can be read.
    const ms = toast.kind === 'error' ? 8000 : 4000
    const id = setTimeout(() => dismiss(toast.id), ms)
    return () => clearTimeout(id)
  }, [toast.id, toast.kind, dismiss])

  return (
    <div
      className={`flex max-w-sm items-start gap-2 rounded-[var(--radius-card)] border-s-2 bg-surface-2 px-3 py-2 text-xs shadow-lg ${ACCENT[toast.kind]}`}
    >
      <Icon size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-fg">{toast.message}</span>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        className="shrink-0 text-fg-subtle hover:text-fg"
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  )
}

export function Toasts(): React.JSX.Element {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-3 end-3 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastRow toast={t} />
        </div>
      ))}
    </div>
  )
}
