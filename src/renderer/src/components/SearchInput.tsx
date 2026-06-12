import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { useRepoStore } from '../store/repoStore'

/** Debounced commit-search box. A non-empty query switches the graph to results. */
export function SearchInput(): React.JSX.Element {
  const { t } = useTranslation()
  const setSearchQuery = useRepoStore((s) => s.setSearchQuery)
  const setViewMode = useRepoStore((s) => s.setViewMode)
  const [text, setText] = useState('')

  useEffect(() => {
    const id = setTimeout(() => {
      setSearchQuery(text)
      if (text.trim()) setViewMode('history')
    }, 300)
    return () => clearTimeout(id)
  }, [text, setSearchQuery, setViewMode])

  return (
    <div className="flex items-center gap-1.5 rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1 text-fg-muted focus-within:border-accent">
      <Search size={14} strokeWidth={1.75} className="shrink-0" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setText('')
        }}
        placeholder={t('search.placeholder')}
        className="w-36 bg-transparent text-xs text-fg outline-none placeholder:text-fg-subtle lg:w-48"
      />
      {text && (
        <button
          type="button"
          onClick={() => setText('')}
          aria-label={t('search.clear')}
          className="shrink-0 hover:text-fg"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}
