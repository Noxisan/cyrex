import { useEffect, useRef } from 'react'

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

/**
 * A small right-click menu positioned at (x, y). Closes on outside click,
 * Escape, scroll, or after an item is chosen.
 */
export function ContextMenu({
  state,
  onClose
}: {
  state: MenuState | null
  onClose: () => void
}): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!state) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [state, onClose])

  if (!state) return null

  // Keep the menu on-screen.
  const left = Math.min(state.x, window.innerWidth - 200)
  const top = Math.min(state.y, window.innerHeight - state.items.length * 30 - 12)

  return (
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-50 min-w-[180px] overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface-2 py-1 shadow-xl"
    >
      {state.items.map((item, i) => (
        <button
          key={i}
          type="button"
          disabled={item.disabled}
          onClick={() => {
            onClose()
            item.onClick()
          }}
          className={`block w-full px-3 py-1.5 text-start text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            item.danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-surface'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
