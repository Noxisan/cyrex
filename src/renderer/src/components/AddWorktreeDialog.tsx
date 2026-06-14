import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen } from 'lucide-react'
import { useWorktreeAdd } from '../hooks/useRepo'
import { useRepoStore } from '../store/repoStore'
import { useToastStore } from '../store/toastStore'

/**
 * Add a linked worktree: choose a parent folder + name, and a branch to check
 * out there (optionally created new). On success the worktree is opened as a
 * repository. The new directory must not already exist (git creates it).
 */
export function AddWorktreeDialog({
  repoPath,
  branches,
  onClose
}: {
  repoPath: string
  branches: string[]
  onClose: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const add = useWorktreeAdd(repoPath)
  const addRepo = useRepoStore((s) => s.addRepo)
  const pushToast = useToastStore((s) => s.push)
  const [parentDir, setParentDir] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [ref, setRef] = useState('')
  const [newBranch, setNewBranch] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function chooseLocation(): Promise<void> {
    const dir = await window.cyrex.pickDirectory()
    if (dir.ok && dir.data) setParentDir(dir.data)
  }

  // Default the folder name from the branch the first time a branch is entered.
  function onRefChange(value: string): void {
    setRef(value)
    if (!name.trim()) setName(value.replace(/[^a-zA-Z0-9._-]+/g, '-'))
  }

  const canSubmit = !!parentDir && name.trim().length > 0 && ref.trim().length > 0

  function submit(): void {
    if (!canSubmit || !parentDir) return
    add.mutate(
      { parentDir, name: name.trim(), ref: ref.trim(), newBranch },
      {
        onSuccess: (worktree) => {
          addRepo(worktree)
          pushToast(t('worktree.added'), 'success')
          onClose()
        }
      }
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="w-[440px] rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-sm font-semibold text-fg">{t('worktree.addTitle')}</h2>

        <label className="mb-1 block text-xs text-fg-muted">{t('worktree.location')}</label>
        <button
          type="button"
          onClick={chooseLocation}
          className="mb-3 flex w-full items-center gap-2 truncate rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1.5 text-start text-xs text-fg hover:border-accent"
        >
          <FolderOpen size={14} className="shrink-0 text-fg-subtle" />
          <span className="truncate">{parentDir ?? t('worktree.chooseLocation')}</span>
        </button>

        <label className="mb-1 block text-xs text-fg-muted">{t('worktree.folderName')}</label>
        <input
          value={name}
          placeholder={t('worktree.folderPlaceholder')}
          onChange={(e) => setName(e.target.value)}
          className="mb-3 w-full rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1.5 font-mono text-xs text-fg outline-none focus:border-accent"
        />

        <label className="mb-1 block text-xs text-fg-muted">{t('worktree.branch')}</label>
        <input
          value={ref}
          list="cyrex-wt-branches"
          placeholder={t('worktree.branchPlaceholder')}
          onChange={(e) => onRefChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          className="mb-2 w-full rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1.5 font-mono text-xs text-fg outline-none focus:border-accent"
        />
        <datalist id="cyrex-wt-branches">
          {branches.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>

        <label className="mb-4 flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={newBranch}
            onChange={(e) => setNewBranch(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          {t('worktree.newBranch')}
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-card)] px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || add.isPending}
            className="rounded-[var(--radius-card)] bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-40"
          >
            {t('common.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
