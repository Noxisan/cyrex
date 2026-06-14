import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RemoteRepo } from '@shared/types'
import { useRepoStore } from '../store/repoStore'
import { useAccounts, useCloneRepo, useCreateRepo } from '../hooks/useHosting'
import { usePush } from '../hooks/useRepo'
import { useToastStore } from '../store/toastStore'

/**
 * Create a repository on the provider, then optionally clone it locally or link
 * it to the currently open repo (set `origin` and push).
 */
export function CreateRepoDialog(): React.JSX.Element | null {
  const { t } = useTranslation()
  const open = useRepoStore((s) => s.createRepoOpen)
  const close = useRepoStore((s) => s.closeCreateRepo)
  const activePath = useRepoStore((s) => s.activePath)
  const repos = useRepoStore((s) => s.repos)
  const addRepo = useRepoStore((s) => s.addRepo)
  const pushToast = useToastStore((s) => s.push)
  const { data: accounts } = useAccounts()
  const create = useCreateRepo()
  const clone = useCloneRepo()
  const push = usePush(activePath ?? '')

  const [accountId, setAccountId] = useState<string | null>(null)
  const active = accountId ?? accounts?.[0]?.id ?? null
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(true)
  const [created, setCreated] = useState<RemoteRepo | null>(null)

  if (!open) return null

  const activeRepoName = repos.find((r) => r.path === activePath)?.name ?? null

  function reset(): void {
    setName('')
    setDescription('')
    setIsPrivate(true)
    setCreated(null)
  }

  function submit(): void {
    if (!active || !name.trim()) return
    create.mutate(
      { accountId: active, input: { name: name.trim(), description: description.trim(), private: isPrivate } },
      { onSuccess: (repo) => setCreated(repo) }
    )
  }

  async function cloneCreated(): Promise<void> {
    if (!created || !active) return
    const dir = await window.cyrex.pickDirectory()
    if (!dir.ok || !dir.data) return
    clone.mutate(
      { cloneUrl: created.cloneUrl, parentDir: dir.data, name: created.name, accountId: active },
      {
        onSuccess: (ref) => {
          addRepo(ref)
          pushToast(t('hosting.cloned', { name: ref.name }), 'success')
          reset()
          close()
        }
      }
    )
  }

  async function linkCreated(): Promise<void> {
    if (!created || !activePath) return
    const res = await window.cyrex.setRemote(activePath, created.cloneUrl, 'origin')
    if (!res.ok) {
      pushToast(res.error, 'error')
      return
    }
    push.mutate(false, {
      onSuccess: () => {
        pushToast(t('hosting.linked', { name: created.fullName }), 'success')
        reset()
        close()
      }
    })
  }

  function done(): void {
    reset()
    close()
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50"
      onMouseDown={done}
    >
      <div
        className="w-[440px] rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {!created ? (
          <>
            <h2 className="mb-3 text-sm font-semibold text-fg">{t('hosting.createTitle')}</h2>

            {(accounts?.length ?? 0) > 1 && (
              <select
                value={active ?? ''}
                onChange={(e) => setAccountId(e.target.value)}
                className="mb-2 w-full rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1.5 text-xs text-fg outline-none"
              >
                {accounts?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.login}
                  </option>
                ))}
              </select>
            )}

            <input
              autoFocus
              value={name}
              placeholder={t('hosting.repoName')}
              onChange={(e) => setName(e.target.value)}
              className="mb-2 w-full rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1.5 text-xs text-fg outline-none focus:border-accent"
            />
            <input
              value={description}
              placeholder={t('hosting.repoDescription')}
              onChange={(e) => setDescription(e.target.value)}
              className="mb-2 w-full rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1.5 text-xs text-fg outline-none focus:border-accent"
            />
            <label className="mb-4 flex items-center gap-2 text-xs text-fg-muted">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              {t('hosting.private')}
            </label>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={done}
                className="rounded-[var(--radius-card)] px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!name.trim() || create.isPending}
                className="rounded-[var(--radius-card)] bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-40"
              >
                {create.isPending ? t('hosting.creating') : t('common.create')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="mb-1 text-sm font-semibold text-fg">{t('hosting.created')}</h2>
            <p className="mb-4 break-all text-xs text-fg-muted">{created.fullName}</p>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={cloneCreated}
                disabled={clone.isPending}
                className="rounded-[var(--radius-card)] bg-accent px-3 py-2 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-40"
              >
                {t('hosting.cloneNow')}
              </button>
              {activeRepoName && (
                <button
                  type="button"
                  onClick={linkCreated}
                  disabled={push.isPending}
                  className="rounded-[var(--radius-card)] border border-border px-3 py-2 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                >
                  {t('hosting.linkPush', { name: activeRepoName })}
                </button>
              )}
              <button
                type="button"
                onClick={done}
                className="rounded-[var(--radius-card)] px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                {t('hosting.done')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
