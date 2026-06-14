import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CloudOff, Download, FilePlus2, Plus, UserRound } from 'lucide-react'
import { useRepoStore } from '../store/repoStore'
import { useAccounts, useDisconnect } from '../hooks/useHosting'
import { ConnectWizard } from './ConnectWizard'

/**
 * Hosting hub, opened from the top-bar Accounts button. Lists connected
 * accounts (metadata only), launches the connect wizard, and is the entry point
 * for cloning and creating remote repositories.
 */
export function AccountsDialog(): React.JSX.Element | null {
  const { t } = useTranslation()
  const open = useRepoStore((s) => s.accountsOpen)
  const close = useRepoStore((s) => s.closeAccounts)
  const openClone = useRepoStore((s) => s.openClone)
  const openCreateRepo = useRepoStore((s) => s.openCreateRepo)
  const { data: accounts } = useAccounts()
  const disconnect = useDisconnect()
  const [connecting, setConnecting] = useState(false)

  if (!open) return null

  const hasAccounts = (accounts?.length ?? 0) > 0

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50"
      onMouseDown={close}
    >
      <div
        className="w-[480px] rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {connecting ? (
          <ConnectWizard onClose={() => setConnecting(false)} />
        ) : (
          <>
            <h2 className="mb-3 text-sm font-semibold text-fg">{t('hosting.accounts')}</h2>

            <div className="mb-3 flex flex-col gap-1">
              {!hasAccounts && (
                <p className="px-1 py-4 text-center text-xs text-fg-subtle">
                  {t('hosting.noAccounts')}
                </p>
              )}
              {accounts?.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2.5 rounded-[var(--radius-card)] border border-border px-3 py-2"
                >
                  {a.avatarUrl ? (
                    <img src={a.avatarUrl} alt="" className="size-7 rounded-full" />
                  ) : (
                    <UserRound size={20} className="text-fg-subtle" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-fg">{a.login}</div>
                    <div className="text-[10px] uppercase tracking-wide text-fg-subtle">
                      {a.provider}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => disconnect.mutate(a.id)}
                    title={t('hosting.disconnect')}
                    className="flex items-center gap-1 rounded-[var(--radius-card)] px-2 py-1 text-[11px] text-fg-muted hover:bg-surface-2 hover:text-danger"
                  >
                    <CloudOff size={13} /> {t('hosting.disconnect')}
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setConnecting(true)}
              className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-card)] border border-dashed border-border px-3 py-2 text-xs text-fg-muted hover:border-accent hover:text-fg"
            >
              <Plus size={14} /> {t('hosting.connectAccount')}
            </button>

            <div className="flex justify-between gap-2 border-t border-border pt-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!hasAccounts}
                  onClick={() => {
                    close()
                    openClone()
                  }}
                  className="flex items-center gap-1.5 rounded-[var(--radius-card)] bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-40"
                >
                  <Download size={14} /> {t('hosting.clone')}
                </button>
                <button
                  type="button"
                  disabled={!hasAccounts}
                  onClick={() => {
                    close()
                    openCreateRepo()
                  }}
                  className="flex items-center gap-1.5 rounded-[var(--radius-card)] border border-border px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                >
                  <FilePlus2 size={14} /> {t('hosting.createRepo')}
                </button>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-[var(--radius-card)] px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                {t('common.cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
