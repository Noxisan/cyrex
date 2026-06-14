import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CloudOff, FilePlus2, FolderOpen, Lock, Plus, Search } from 'lucide-react'
import { useRepoStore } from '../store/repoStore'
import { useAccounts, useCloneRepo, useDisconnect, useRemoteRepos } from '../hooks/useHosting'
import { useToastStore } from '../store/toastStore'
import { ConnectWizard } from './ConnectWizard'
import { ProviderIcon } from './BrandIcon'

/**
 * The unified "Open Repository" modal. Left: local repositories (open a folder,
 * pick a recent one). Right: connected hosting accounts and their remote
 * repositories to clone. Replaces the separate accounts/clone dialogs.
 */
export function OpenRepoDialog(): React.JSX.Element | null {
  const { t } = useTranslation()
  const open = useRepoStore((s) => s.openRepoOpen)
  const close = useRepoStore((s) => s.closeRepoModal)
  const repos = useRepoStore((s) => s.repos)
  const activePath = useRepoStore((s) => s.activePath)
  const addRepo = useRepoStore((s) => s.addRepo)
  const setActive = useRepoStore((s) => s.setActive)
  const openCreateRepo = useRepoStore((s) => s.openCreateRepo)
  const pushToast = useToastStore((s) => s.push)

  const { data: accounts } = useAccounts()
  const disconnect = useDisconnect()
  const clone = useCloneRepo()

  const [connecting, setConnecting] = useState(false)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const activeAccount = accountId ?? accounts?.[0]?.id ?? null
  const { data: remoteRepos, isLoading } = useRemoteRepos(open ? activeAccount : null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return remoteRepos ?? []
    return (remoteRepos ?? []).filter((r) => r.fullName.toLowerCase().includes(q))
  }, [remoteRepos, query])

  if (!open) return null

  const chosen = (remoteRepos ?? []).find((r) => r.id === selected) ?? null
  const hasAccounts = (accounts?.length ?? 0) > 0

  async function openFolder(): Promise<void> {
    const res = await window.cyrex.openRepoDialog()
    if (res.ok && res.data) {
      addRepo(res.data)
      close()
    }
  }

  async function cloneChosen(): Promise<void> {
    if (!chosen || !activeAccount) return
    const dir = await window.cyrex.pickDirectory()
    if (!dir.ok || !dir.data) return
    clone.mutate(
      { cloneUrl: chosen.cloneUrl, parentDir: dir.data, name: chosen.name, accountId: activeAccount },
      {
        onSuccess: (ref) => {
          addRepo(ref)
          pushToast(t('hosting.cloned', { name: ref.name }), 'success')
          close()
        }
      }
    )
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50"
      onMouseDown={close}
    >
      <div
        className="flex h-[560px] w-[820px] overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Left: local repositories */}
        <div className="flex w-[300px] shrink-0 flex-col border-e border-border p-4">
          <h2 className="mb-3 text-sm font-semibold text-fg">{t('openRepo.local')}</h2>
          <button
            type="button"
            onClick={openFolder}
            className="mb-3 flex items-center justify-center gap-2 rounded-[var(--radius-card)] bg-accent px-3 py-2 text-xs font-medium text-accent-fg hover:bg-accent-hover"
          >
            <FolderOpen size={15} strokeWidth={1.75} />
            {t('openRepo.openFolder')}
          </button>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
            {t('openRepo.recent')}
          </div>
          <div className="-mx-1 min-h-0 flex-1 overflow-auto">
            {repos.length === 0 ? (
              <p className="px-1 py-3 text-xs text-fg-subtle">{t('sidebar.empty')}</p>
            ) : (
              repos.map((r) => (
                <button
                  key={r.path}
                  type="button"
                  onClick={() => {
                    setActive(r.path)
                    close()
                  }}
                  title={r.path}
                  className={`flex w-full flex-col items-start rounded-[var(--radius-card)] px-2 py-1.5 text-start hover:bg-surface-2 ${
                    r.path === activePath ? 'text-accent' : 'text-fg'
                  }`}
                >
                  <span className="truncate text-xs font-medium">{r.name}</span>
                  <span className="w-full truncate text-[10px] text-fg-subtle">{r.path}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: remote accounts + repositories */}
        <div className="flex min-w-0 flex-1 flex-col p-4">
          {connecting ? (
            <ConnectWizard onClose={() => setConnecting(false)} />
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg">{t('openRepo.remote')}</h2>
                {hasAccounts && (
                  <button
                    type="button"
                    onClick={() => {
                      close()
                      openCreateRepo()
                    }}
                    className="flex items-center gap-1.5 rounded-[var(--radius-card)] border border-border px-2 py-1 text-[11px] text-fg-muted hover:bg-surface-2 hover:text-fg"
                  >
                    <FilePlus2 size={13} /> {t('hosting.createRepo')}
                  </button>
                )}
              </div>

              {!hasAccounts ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                  <p className="max-w-xs text-xs text-fg-muted">{t('hosting.noAccounts')}</p>
                  <button
                    type="button"
                    onClick={() => setConnecting(true)}
                    className="flex items-center gap-1.5 rounded-[var(--radius-card)] bg-accent px-3 py-2 text-xs font-medium text-accent-fg hover:bg-accent-hover"
                  >
                    <Plus size={14} /> {t('hosting.connectAccount')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex items-center gap-2">
                    <select
                      value={activeAccount ?? ''}
                      onChange={(e) => {
                        setAccountId(e.target.value)
                        setSelected(null)
                      }}
                      className="rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1.5 text-xs text-fg outline-none"
                    >
                      {accounts?.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.login} ({a.provider})
                        </option>
                      ))}
                    </select>
                    {activeAccount && (
                      <ProviderIcon
                        id={(accounts?.find((a) => a.id === activeAccount)?.provider ?? 'github')}
                        size={15}
                        className="text-fg-muted"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setConnecting(true)}
                      title={t('hosting.connectAccount')}
                      className="rounded-[var(--radius-card)] p-1.5 text-fg-muted hover:bg-surface-2 hover:text-accent"
                    >
                      <Plus size={14} />
                    </button>
                    {activeAccount && (
                      <button
                        type="button"
                        onClick={() => disconnect.mutate(activeAccount)}
                        title={t('hosting.disconnect')}
                        className="rounded-[var(--radius-card)] p-1.5 text-fg-muted hover:bg-surface-2 hover:text-danger"
                      >
                        <CloudOff size={14} />
                      </button>
                    )}
                    <div className="flex flex-1 items-center gap-1.5 rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1.5 focus-within:border-accent">
                      <Search size={14} className="text-fg-subtle" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('hosting.searchRepos')}
                        className="w-full bg-transparent text-xs text-fg outline-none placeholder:text-fg-subtle"
                      />
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-auto rounded-[var(--radius-card)] border border-border">
                    {isLoading && (
                      <p className="px-3 py-6 text-center text-xs text-fg-subtle">
                        {t('hosting.loading')}
                      </p>
                    )}
                    {!isLoading && filtered.length === 0 && (
                      <p className="px-3 py-6 text-center text-xs text-fg-subtle">
                        {t('hosting.noRepos')}
                      </p>
                    )}
                    {filtered.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelected(r.id)}
                        className={`flex w-full items-start gap-2 border-b border-border/60 px-3 py-2 text-start last:border-0 ${
                          selected === r.id ? 'bg-surface-2' : 'hover:bg-surface-2'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium text-fg">
                              {r.fullName}
                            </span>
                            {r.private && <Lock size={11} className="shrink-0 text-fg-subtle" />}
                          </div>
                          {r.description && (
                            <div className="truncate text-[11px] text-fg-muted">
                              {r.description}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={cloneChosen}
                      disabled={!chosen || clone.isPending}
                      className="rounded-[var(--radius-card)] bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-40"
                    >
                      {clone.isPending ? t('hosting.cloning') : t('hosting.clone')}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
