import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { LANGUAGES } from '../i18n'

export function LanguageSwitcher(): React.JSX.Element {
  const { i18n } = useTranslation()

  return (
    <label
      className="flex items-center gap-1 rounded-[var(--radius-card)] px-1.5 py-1 text-fg-muted hover:bg-surface-2"
      title="Language"
    >
      <Languages size={16} strokeWidth={1.75} />
      <select
        value={i18n.language}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent text-xs text-fg outline-none"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} disabled={!l.ready} className="bg-surface text-fg">
            {l.label}
            {l.ready ? '' : ' …'}
          </option>
        ))}
      </select>
    </label>
  )
}
