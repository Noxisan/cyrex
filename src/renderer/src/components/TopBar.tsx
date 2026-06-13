import { useTranslation } from 'react-i18next'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Archive,
  FolderOpen,
  RefreshCw,
  Settings,
  Undo2
} from 'lucide-react'
import { useState } from 'react'
import { useRepoStore } from '../store/repoStore'
import { useFetch, usePull, usePush, useStashSave } from '../hooks/useRepo'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeToggle } from './ThemeToggle'
import { PromptDialog } from './PromptDialog'
import type { PromptState } from './PromptDialog'
import { SearchInput } from './SearchInput'
import { ContextMenu } from './ContextMenu'
import type { MenuState } from './ContextMenu'
import { ConfirmDialog } from './ConfirmDialog'
import type { ConfirmState } from './ConfirmDialog'

function ToolButton({
  label,
  icon: Icon,
  onClick,
  onContextMenu,
  disabled,
  loading
}: {
  label: string
  icon: typeof RefreshCw
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  disabled?: boolean
  loading?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      disabled={disabled || loading}
      title={label}
      aria-label={label}
      className="flex items-center gap-1.5 rounded-[var(--radius-card)] px-2.5 py-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon size={16} strokeWidth={1.75} className={loading ? 'animate-spin' : undefined} />
      <span className="hidden text-xs lg:inline">{label}</span>
    </button>
  )
}

export function TopBar(): React.JSX.Element {
  const { t } = useTranslation()
  const activePath = useRepoStore((s) => s.activePath)
  const addRepo = useRepoStore((s) => s.addRepo)
  const openReflog = useRepoStore((s) => s.openReflog)
  const stashSave = useStashSave(activePath ?? '')
  const fetch = useFetch(activePath ?? '')
  const pull = usePull(activePath ?? '')
  const push = usePush(activePath ?? '')
  const [prompt, setPrompt] = useState<PromptState | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  async function openRepo(): Promise<void> {
    const res = await window.cyrex.openRepoDialog()
    if (res.ok && res.data) addRepo(res.data)
  }

  function pushMenu(e: React.MouseEvent): void {
    e.preventDefault()
    if (!activePath) return
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: t('remote.forcePush'),
          danger: true,
          onClick: () =>
            setConfirm({
              title: t('remote.forcePush'),
              message: t('remote.forcePushMessage'),
              confirmLabel: t('remote.forcePush'),
              danger: true,
              onConfirm: () => push.mutate(true)
            })
        }
      ]
    })
  }

  function stash(): void {
    setPrompt({
      title: t('stash.saveTitle'),
      placeholder: t('stash.messagePlaceholder'),
      confirmLabel: t('actions.stash'),
      requireValue: false,
      onSubmit: (message) => stashSave.mutate(message || undefined)
    })
  }

  const hasRepo = !!activePath

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-surface px-3">
      <div className="flex items-center gap-2 pe-2">
        <span className="size-2.5 rounded-full bg-accent" aria-hidden />
        <span className="text-sm font-semibold tracking-tight">{t('app.name')}</span>
      </div>

      <div className="mx-1 h-5 w-px bg-border" aria-hidden />

      <ToolButton
        label={t('actions.fetch')}
        icon={RefreshCw}
        onClick={() => fetch.mutate(undefined)}
        disabled={!hasRepo}
        loading={fetch.isPending}
      />
      <ToolButton
        label={t('actions.pull')}
        icon={ArrowDownToLine}
        onClick={() => pull.mutate(undefined)}
        disabled={!hasRepo}
        loading={pull.isPending}
      />
      <ToolButton
        label={t('actions.push')}
        icon={ArrowUpFromLine}
        onClick={() => push.mutate(false)}
        onContextMenu={pushMenu}
        disabled={!hasRepo}
        loading={push.isPending}
      />
      <ToolButton label={t('actions.stash')} icon={Archive} onClick={stash} disabled={!hasRepo} />
      <ToolButton
        label={t('actions.undo')}
        icon={Undo2}
        onClick={openReflog}
        disabled={!hasRepo}
      />

      <div className="flex-1" />

      {hasRepo && <SearchInput />}
      <button
        type="button"
        onClick={openRepo}
        className="flex items-center gap-1.5 rounded-[var(--radius-card)] bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-hover"
      >
        <FolderOpen size={16} strokeWidth={1.75} />
        {t('actions.openRepository')}
      </button>

      <div className="mx-1 h-5 w-px bg-border" aria-hidden />
      <LanguageSwitcher />
      <ThemeToggle />
      <ToolButton label={t('actions.settings')} icon={Settings} />

      <PromptDialog state={prompt} onClose={() => setPrompt(null)} />
      <ContextMenu state={menu} onClose={() => setMenu(null)} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </header>
  )
}
