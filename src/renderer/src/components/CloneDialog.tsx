import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, Search } from 'lucide-react'
import { useRepoStore } from '../store/repoStore'
import { useAccounts, useCloneRepo, useRemoteRepos } from '../hooks/useHosting'
import { useToastStore } from '../store/toastStore'

/** Browse an account's repositories and clone one to a chosen folder. */
export function CloneDialog(): React.JSX.Element | null {
  const { t } = useTranslation()
  const open = useRepoStore((s) => s.cloneOpen)
  const close = useRepoStore((s) => s.closeClone)
  const addRepo = useRepoStore((s) => s.addRepo)
  const pushToast = useToastStore((s) => s.push)
  const { data: accounts } = useAccounts()
  const [accountId, setAccountId] = useState<string | null>(null)
  const active = accountId ?? accounts?.[0]?.id ?? null
  const { data: repos, isLoading } = useRemoteRepos(open ? active : null)
  const clone = useCloneRepo()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return repos ?? []
    return (repos ?? []).filter((r) => r.fullName.toLowerCase().includes(q))
  }, [repos, query])

  if (!open) return null

  const chosen = (repos ?? []).find((r) => r.id === selected) ?? null

  async function cloneChosen(): Promise<void> {
    if (!chosen || !active) return
    const parentDir = await window.cyrex.pickDirectory()
    if (!parentDir.ok || !parentDir.data) return
    clone.mutate(
      { cloneUrl: chosen.cloneUrl, parentDir: parentDir.data, name: chosen.name, accountId: active },
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
        className="flex h-[560px] w-[560px] flex-col rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-sm font-semibold text-fg">{t('hosting.cloneTitle')}</h2>

        <div className="mb-2 flex items-center gap-2">
          {(accounts?.length ?? 0) > 1 && (
            <select
              value={active ?? ''}
              onChange={(e) => {
                setAccountId(e.target.value)
                setSelected(null)
              }}
              className="rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1.5 text-xs text-fg outline-none"
            >
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.login}
                </option>
              ))}
            </select>
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
            <p className="px-3 py-6 text-center text-xs text-fg-subtle">{t('hosting.loading')}</p>
          )}
          {!isLoading && filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-fg-subtle">{t('hosting.noRepos')}</p>
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
                  <span className="truncate text-xs font-medium text-fg">{r.fullName}</span>
                  {r.private && <Lock size={11} className="shrink-0 text-fg-subtle" />}
                </div>
                {r.description && (
                  <div className="truncate text-[11px] text-fg-muted">{r.description}</div>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-[var(--radius-card)] px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={cloneChosen}
            disabled={!chosen || clone.isPending}
            className="rounded-[var(--radius-card)] bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-40"
          >
            {clone.isPending ? t('hosting.cloning') : t('hosting.clone')}
          </button>
        </div>
      </div>
    </div>
  )
}
