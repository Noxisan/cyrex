/**
 * i18n bootstrap. Cyrex ships the top-10 most-spoken languages plus German
 * (CLAUDE.md §6). en + de are authored now; the remaining locales are declared
 * here and fall back to English until their translation.json files are added.
 *
 * RTL languages (ar, ur) flip document direction — see applyDirection().
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '../locales/en/translation.json'
import de from '../locales/de/translation.json'

export interface LanguageMeta {
  code: string
  /** Native endonym shown in the switcher. */
  label: string
  rtl: boolean
}

/** Full shipped set (CLAUDE.md §6). `ready` flags which have translations now. */
export const LANGUAGES: (LanguageMeta & { ready: boolean })[] = [
  { code: 'en', label: 'English', rtl: false, ready: true },
  { code: 'de', label: 'Deutsch', rtl: false, ready: true },
  { code: 'zh', label: '中文', rtl: false, ready: false },
  { code: 'hi', label: 'हिन्दी', rtl: false, ready: false },
  { code: 'es', label: 'Español', rtl: false, ready: false },
  { code: 'fr', label: 'Français', rtl: false, ready: false },
  { code: 'ar', label: 'العربية', rtl: true, ready: false },
  { code: 'bn', label: 'বাংলা', rtl: false, ready: false },
  { code: 'pt', label: 'Português', rtl: false, ready: false },
  { code: 'ru', label: 'Русский', rtl: false, ready: false },
  { code: 'ur', label: 'اردو', rtl: true, ready: false }
]

const RTL_CODES = new Set(LANGUAGES.filter((l) => l.rtl).map((l) => l.code))
const STORAGE_KEY = 'cyrex.language'

export function applyDirection(lang: string): void {
  const dir = RTL_CODES.has(lang) ? 'rtl' : 'ltr'
  document.documentElement.setAttribute('dir', dir)
  document.documentElement.setAttribute('lang', lang)
}

const initial = localStorage.getItem(STORAGE_KEY) ?? 'en'

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de }
  },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

i18n.on('languageChanged', (lang) => {
  localStorage.setItem(STORAGE_KEY, lang)
  applyDirection(lang)
})

applyDirection(initial)

export default i18n
