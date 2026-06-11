import { Moon, Sun } from 'lucide-react'
import { useRepoStore } from '../store/repoStore'

export function ThemeToggle(): React.JSX.Element {
  const theme = useRepoStore((s) => s.theme)
  const toggleTheme = useRepoStore((s) => s.toggleTheme)

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
      aria-label="Toggle theme"
      className="rounded-[var(--radius-card)] p-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {theme === 'dark' ? (
        <Sun size={16} strokeWidth={1.75} />
      ) : (
        <Moon size={16} strokeWidth={1.75} />
      )}
    </button>
  )
}
