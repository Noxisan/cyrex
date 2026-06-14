import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  Keyboard,
  Monitor,
  Moon,
  Palette,
  SlidersHorizontal,
  Sun,
  X
} from 'lucide-react'
import { ACCENTS, useRepoStore } from '../store/repoStore'
import type { ThemeMode, ViewMode } from '../store/repoStore'
import { LANGUAGES } from '../i18n'

type SectionId = 'general' | 'appearance' | 'shortcuts'

const isMac = navigator.userAgent.includes('Mac')
const MOD = isMac ? '⌘' : 'Ctrl'

/** Keyboard reference, derived from the handlers actually wired in the app. */
function shortcuts(t: (k: string) => string): { keys: string[]; label: string }[] {
  return [
    { keys: [`${MOD}`, 'K'], label: t('palette.open') },
    { keys: [`${MOD}`, ','], label: t('actions.settings') },
    { keys: ['G', 'H'], label: t('settings.shortcut.goHistory') },
    { keys: ['G', 'C'], label: t('settings.shortcut.goChanges') },
    { keys: [`${MOD}`, '↵'], label: t('settings.shortcut.commit') },
    { keys: ['Esc'], label: t('settings.shortcut.dismiss') }
  ]
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-xs text-fg">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string; icon?: typeof Sun }[]
  onChange: (v: T) => void
}): React.JSX.Element {
  return (
    <div className="flex rounded-[var(--radius-card)] border border-border p-0.5">
      {options.map((o) => {
        const Icon = o.icon
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-xs transition-colors ${
              active ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {Icon && <Icon size={13} strokeWidth={1.75} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function SettingsDialog(): React.JSX.Element | null {
  const { t, i18n } = useTranslation()
  const open = useRepoStore((s) => s.settingsOpen)
  const openSettings = useRepoStore((s) => s.openSettings)
  const closeSettings = useRepoStore((s) => s.closeSettings)
  const themeMode = useRepoStore((s) => s.themeMode)
  const setThemeMode = useRepoStore((s) => s.setThemeMode)
  const accent = useRepoStore((s) => s.accent)
  const setAccent = useRepoStore((s) => s.setAccent)
  const defaultView = useRepoStore((s) => s.defaultView)
  const setDefaultView = useRepoStore((s) => s.setDefaultView)
  const [section, setSection] = useState<SectionId>('general')

  // Global open/close shortcut (Cmd/Ctrl+,) and Escape to dismiss.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        if (useRepoStore.getState().settingsOpen) closeSettings()
        else openSettings()
      } else if (e.key === 'Escape' && useRepoStore.getState().settingsOpen) {
        closeSettings()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openSettings, closeSettings])

  if (!open) return null

  const nav: { id: SectionId; label: string; icon: typeof Sun }[] = [
    { id: 'general', label: t('settings.general'), icon: SlidersHorizontal },
    { id: 'appearance', label: t('settings.appearance'), icon: Palette },
    { id: 'shortcuts', label: t('settings.shortcuts'), icon: Keyboard }
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={closeSettings}
    >
      <div
        className="flex h-[460px] w-[680px] overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Left nav */}
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-border bg-bg/40 p-2">
          <h2 className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            {t('actions.settings')}
          </h2>
          {nav.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setSection(n.id)}
              className={`flex items-center gap-2 rounded-[var(--radius-card)] px-2.5 py-1.5 text-xs transition-colors ${
                section === n.id
                  ? 'bg-surface-2 text-fg'
                  : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              <n.icon size={15} strokeWidth={1.75} />
              {n.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="relative flex-1 overflow-y-auto p-5">
          <button
            type="button"
            aria-label={t('common.cancel')}
            onClick={closeSettings}
            className="absolute right-3 top-3 rounded-[var(--radius-card)] p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg"
          >
            <X size={16} />
          </button>

          {section === 'general' && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-fg">{t('settings.general')}</h3>
              <Row label={t('settings.language')}>
                <select
                  value={i18n.language}
                  onChange={(e) => void i18n.changeLanguage(e.target.value)}
                  className="cursor-pointer rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1 text-xs text-fg outline-none"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code} disabled={!l.ready}>
                      {l.label}
                      {l.ready ? '' : ' …'}
                    </option>
                  ))}
                </select>
              </Row>
              <div className="border-t border-border" />
              <Row label={t('settings.startView')}>
                <Segmented<ViewMode>
                  value={defaultView}
                  onChange={setDefaultView}
                  options={[
                    { value: 'history', label: t('tabs.history') },
                    { value: 'changes', label: t('tabs.changes') }
                  ]}
                />
              </Row>
            </section>
          )}

          {section === 'appearance' && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-fg">{t('settings.appearance')}</h3>
              <Row label={t('settings.theme')}>
                <Segmented<ThemeMode>
                  value={themeMode}
                  onChange={setThemeMode}
                  options={[
                    { value: 'light', label: t('settings.themeLight'), icon: Sun },
                    { value: 'dark', label: t('settings.themeDark'), icon: Moon },
                    { value: 'system', label: t('settings.themeSystem'), icon: Monitor }
                  ]}
                />
              </Row>
              <div className="border-t border-border" />
              <div className="py-3">
                <p className="mb-1 text-xs text-fg">{t('settings.accent')}</p>
                <p className="mb-3 text-[11px] leading-relaxed text-fg-subtle">
                  {t('settings.accentHint')}
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      title={a.label}
                      onClick={() => setAccent(a.id)}
                      style={{ background: a.accent }}
                      className="flex size-7 items-center justify-center rounded-full transition-transform hover:scale-110"
                    >
                      {accent === a.id && <Check size={15} strokeWidth={3} className="text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {section === 'shortcuts' && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-fg">{t('settings.shortcuts')}</h3>
              <ul className="flex flex-col">
                {shortcuts(t).map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-0"
                  >
                    <span className="text-xs text-fg-muted">{s.label}</span>
                    <span className="flex items-center gap-1">
                      {s.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="min-w-[22px] rounded-[5px] border border-border bg-bg px-1.5 py-0.5 text-center text-[11px] text-fg"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
