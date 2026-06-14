import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Cloud,
  Tag as TagIcon,
  Archive,
  FolderGit2,
  FolderTree,
  Plus,
  Check,
  Star,
  Trash2
} from 'lucide-react'
import { useRepoStore } from '../store/repoStore'
import {
  useBranches,
  useCheckout,
  useCheckoutRemote,
  useCreateBranch,
  useDeleteBranch,
  useMerge,
  useMergeBranch,
  useRebaseBranch,
  useRenameBranch,
  useStashApply,
  useStashDrop,
  useStashes,
  useStashPop,
  useTags,
  useWorktrees,
  useWorktreeRemove
} from '../hooks/useRepo'
import { AddWorktreeDialog } from './AddWorktreeDialog'
import { ContextMenu } from './ContextMenu'
import type { MenuState } from './ContextMenu'
import { ConfirmDialog } from './ConfirmDialog'
import type { ConfirmState } from './ConfirmDialog'

const LANE_COLORS = [
  'var(--color-lane-0)',
  'var(--color-lane-1)',
  'var(--color-lane-2)',
  'var(--color-lane-3)',
  'var(--color-lane-4)',
  'var(--color-lane-5)'
]

// Bright, saturated palette for user-chosen repository dots — deliberately more
// vibrant than the muted graph lane colors so personal color codes pop.
const DOT_COLORS = [
  '#ff4d4d',
  '#ff8a1e',
  '#ffd21e',
  '#3ddc5b',
  '#16d6c4',
  '#2e9bff',
  '#9b6bff',
  '#ff5cc0'
]

function colorFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return LANE_COLORS[h % LANE_COLORS.length]
}

function Section({
  title,
  icon: Icon,
  count,
  action,
  children,
  defaultOpen = true
}: {
  title: string
  icon: typeof GitBranch
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-border/60">
      <div className="flex items-center pe-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-1.5 px-3 py-2 text-xs font-medium text-fg-muted hover:text-fg"
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Icon size={14} strokeWidth={1.75} />
          <span className="flex-1 text-start uppercase tracking-wide">{title}</span>
          {count !== undefined && <span className="text-fg-subtle">{count}</span>}
        </button>
        {action}
      </div>
      {open && <div className="pb-1">{children}</div>}
    </div>
  )
}

function NameInput({
  initial,
  placeholder,
  onSubmit,
  onCancel
}: {
  initial: string
  placeholder: string
  onSubmit: (value: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [value, setValue] = useState(initial)
  return (
    <input
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && value.trim()) onSubmit(value.trim())
        else if (e.key === 'Escape') onCancel()
      }}
      className="mx-3 my-1 w-[calc(100%-1.5rem)] rounded-[var(--radius-card)] border border-accent bg-bg px-2 py-1 font-mono text-xs text-fg outline-none"
    />
  )
}

function RefRow({
  name,
  current,
  badge,
  onDoubleClick,
  onContextMenu,
  draggable,
  dropActive,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop
}: {
  name: string
  current?: boolean
  badge?: string
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  draggable?: boolean
  dropActive?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}): React.JSX.Element {
  return (
    <div
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      title={current ? name : `${name} — double-click to check out`}
      className={`group flex items-center gap-2 px-3 py-1 ps-7 text-xs hover:bg-surface-2 ${
        onDoubleClick ? 'cursor-pointer' : ''
      } ${dropActive ? 'bg-accent/15 ring-1 ring-inset ring-accent' : ''} ${
        current ? 'text-accent' : 'text-fg'
      }`}
    >
      {current ? (
        <Check size={12} strokeWidth={2.5} className="shrink-0 text-accent" />
      ) : (
        <span className="size-2 shrink-0 rounded-full" style={{ background: colorFor(name) }} />
      )}
      <span className="truncate">{name}</span>
      {badge && <span className="ms-auto text-[10px] text-fg-subtle">{badge}</span>}
    </div>
  )
}

/** A small swatch popover for picking a repository's dot color (or clearing it). */
function ColorPopover({
  x,
  y,
  current,
  onPick,
  onClose
}: {
  x: number
  y: number
  current?: string
  onPick: (color?: string) => void
  onClose: () => void
}): React.JSX.Element {
  const left = Math.min(x, window.innerWidth - 250)
  const top = Math.min(y, window.innerHeight - 60)
  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose}>
      <div
        style={{ left, top }}
        className="fixed flex items-center gap-1.5 rounded-[var(--radius-card)] border border-border bg-surface-2 p-2 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onPick(undefined)}
          title="Default"
          className="flex size-4 items-center justify-center rounded-full border border-border"
          style={{ background: 'var(--color-fg-subtle)' }}
        >
          {!current && <Check size={10} className="text-bg" strokeWidth={3} />}
        </button>
        {DOT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            className="size-4 rounded-full transition-transform hover:scale-110"
            style={{ background: c, outline: current === c ? '2px solid var(--color-fg)' : undefined }}
          />
        ))}
      </div>
    </div>
  )
}

export function Sidebar(): React.JSX.Element {
  const { t } = useTranslation()
  const { repos, activePath, setActive, addRepo, removeRepo, toggleFavorite, setRepoColor } =
    useRepoStore()
  const branches = useBranches(activePath)
  const tags = useTags(activePath)
  const stashes = useStashes(activePath)
  const worktrees = useWorktrees(activePath)

  const path = activePath ?? ''
  const checkout = useCheckout(path)
  const checkoutRemote = useCheckoutRemote(path)
  const createBranch = useCreateBranch(path)
  const renameBranch = useRenameBranch(path)
  const deleteBranch = useDeleteBranch(path)
  const merge = useMerge(path)
  const mergeBranch = useMergeBranch(path)
  const rebaseBranch = useRebaseBranch(path)
  const stashApply = useStashApply(path)
  const stashPop = useStashPop(path)
  const stashDrop = useStashDrop(path)
  const worktreeRemove = useWorktreeRemove(path)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [creating, setCreating] = useState(false)
  const [addingWorktree, setAddingWorktree] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  // Branch being dragged, and the branch currently hovered as a drop target.
  const [dragBranch, setDragBranch] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  // Open color-swatch popover for a repository row, anchored at a screen point.
  const [colorPopover, setColorPopover] = useState<{ path: string; x: number; y: number } | null>(
    null
  )

  const locals = branches.data?.filter((b) => b.kind === 'local') ?? []
  const remotes = branches.data?.filter((b) => b.kind === 'remote') ?? []
  const currentBranch = locals.find((b) => b.current)?.name ?? null

  const localMenu = (e: React.MouseEvent, name: string, current: boolean): void => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: t('branch.checkout'), onClick: () => checkout.mutate(name), disabled: current },
        {
          label: t('branch.mergeInto', { current: currentBranch ?? 'HEAD' }),
          disabled: current || !currentBranch,
          onClick: () => merge.mutate(name)
        },
        { label: t('branch.rename'), onClick: () => setRenaming(name) },
        {
          label: t('branch.delete'),
          danger: true,
          disabled: current,
          onClick: () => deleteBranch.mutate({ name, force: false })
        },
        {
          label: t('branch.forceDelete'),
          danger: true,
          disabled: current,
          onClick: () =>
            setConfirm({
              title: t('branch.forceDelete'),
              message: t('branch.forceDeleteMessage', { name }),
              confirmLabel: t('branch.forceDelete'),
              danger: true,
              onConfirm: () => deleteBranch.mutate({ name, force: true })
            })
        }
      ]
    })
  }

  // Drop one local branch onto another: offer merge or rebase, each confirmed.
  // Both go through the engine (checkout + merge/rebase) — never auto-resolved.
  const branchDrop = (e: React.DragEvent, target: string): void => {
    e.preventDefault()
    const source = e.dataTransfer.getData('text/cyrex-branch') || dragBranch
    setDragBranch(null)
    setDropTarget(null)
    if (!source || source === target) return
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: t('dnd.merge', { source, target }),
          onClick: () =>
            setConfirm({
              title: t('dnd.mergeTitle'),
              message: t('dnd.mergeMessage', { source, target }),
              confirmLabel: t('actions.merge'),
              onConfirm: () => mergeBranch.mutate({ source, target })
            })
        },
        {
          label: t('dnd.rebase', { source, target }),
          danger: true,
          onClick: () =>
            setConfirm({
              title: t('dnd.rebaseTitle'),
              message: t('dnd.rebaseMessage', { source, target }),
              confirmLabel: t('actions.rebase'),
              danger: true,
              onConfirm: () => rebaseBranch.mutate({ branch: source, onto: target })
            })
        }
      ]
    })
  }

  const remoteMenu = (e: React.MouseEvent, name: string): void => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [{ label: t('branch.checkoutTracking'), onClick: () => checkoutRemote.mutate(name) }]
    })
  }

  const stashMenu = (e: React.MouseEvent, index: number): void => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: t('stash.apply'), onClick: () => stashApply.mutate(index) },
        { label: t('stash.pop'), onClick: () => stashPop.mutate(index) },
        {
          label: t('stash.drop'),
          danger: true,
          onClick: () =>
            setConfirm({
              title: t('stash.drop'),
              message: t('stash.dropMessage'),
              confirmLabel: t('stash.drop'),
              danger: true,
              onConfirm: () => stashDrop.mutate(index)
            })
        }
      ]
    })
  }

  // Open a worktree's directory as a repository (validated by the engine).
  const openWorktree = async (wtPath: string): Promise<void> => {
    if (wtPath === activePath) return
    const res = await window.cyrex.openRepo(wtPath)
    if (res.ok) {
      addRepo(res.data)
      setActive(res.data.path)
    }
  }

  const worktreeMenu = (e: React.MouseEvent, wt: { path: string; isMain: boolean }): void => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: t('worktree.open'),
          disabled: wt.path === activePath,
          onClick: () => void openWorktree(wt.path)
        },
        { label: t('worktree.copyPath'), onClick: () => void navigator.clipboard.writeText(wt.path) },
        {
          label: t('worktree.remove'),
          danger: true,
          // The main working tree can't be removed; neither can the active one.
          disabled: wt.isMain || wt.path === activePath,
          onClick: () =>
            setConfirm({
              title: t('worktree.remove'),
              message: t('worktree.removeMessage', { path: wt.path }),
              confirmLabel: t('worktree.remove'),
              danger: true,
              onConfirm: () => worktreeRemove.mutate({ worktreePath: wt.path, force: true })
            })
        }
      ]
    })
  }

  return (
    <nav className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface">
      <Section title={t('sidebar.repositories')} icon={FolderGit2} count={repos.length}>
        {repos.length === 0 ? (
          <p className="px-3 py-1 ps-7 text-xs text-fg-subtle">{t('sidebar.empty')}</p>
        ) : (
          // Favorites float to the top; original order is otherwise preserved.
          [...repos]
            .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite))
            .map((r) => (
              <div
                key={r.path}
                className={`group flex items-center gap-2 px-3 py-1 ps-7 text-xs hover:bg-surface-2 ${
                  r.path === activePath ? 'text-accent' : 'text-fg'
                }`}
              >
                <button
                  type="button"
                  onClick={(e) => setColorPopover({ path: r.path, x: e.clientX, y: e.clientY })}
                  title={t('repo.setColor')}
                  className="size-2.5 shrink-0 rounded-full transition-transform hover:scale-125"
                  style={{ background: r.color ?? 'var(--color-fg-subtle)' }}
                />
                <button
                  type="button"
                  onClick={() => setActive(r.path)}
                  title={r.path}
                  className="min-w-0 flex-1 truncate text-start"
                >
                  {r.name}
                </button>
                <button
                  type="button"
                  onClick={() => toggleFavorite(r.path)}
                  title={r.favorite ? t('repo.unfavorite') : t('repo.favorite')}
                  className={`shrink-0 transition-opacity ${
                    r.favorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <Star
                    size={12}
                    strokeWidth={2}
                    className={
                      r.favorite
                        ? 'fill-accent text-accent'
                        : 'text-fg-subtle hover:text-accent'
                    }
                  />
                </button>
                <button
                  type="button"
                  onClick={() => removeRepo(r.path)}
                  title={t('repo.remove')}
                  className="shrink-0 text-fg-subtle opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              </div>
            ))
        )}
      </Section>

      <Section
        title={t('sidebar.localBranches')}
        icon={GitBranch}
        count={locals.length}
        action={
          activePath && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              title={t('branch.new')}
              aria-label={t('branch.new')}
              className="rounded-[var(--radius-card)] p-1 text-fg-muted hover:bg-surface-2 hover:text-accent"
            >
              <Plus size={14} strokeWidth={2} />
            </button>
          )
        }
      >
        {creating && (
          <NameInput
            initial=""
            placeholder={t('branch.namePlaceholder')}
            onSubmit={(name) => {
              createBranch.mutate({ name, checkout: true })
              setCreating(false)
            }}
            onCancel={() => setCreating(false)}
          />
        )}
        {locals.length === 0 && !creating ? (
          <p className="px-3 py-1 ps-7 text-xs text-fg-subtle">{t('sidebar.empty')}</p>
        ) : (
          locals.map((b) =>
            renaming === b.name ? (
              <NameInput
                key={b.name}
                initial={b.name}
                placeholder={t('branch.namePlaceholder')}
                onSubmit={(newName) => {
                  if (newName !== b.name) renameBranch.mutate({ oldName: b.name, newName })
                  setRenaming(null)
                }}
                onCancel={() => setRenaming(null)}
              />
            ) : (
              <RefRow
                key={b.name}
                name={b.name}
                current={b.current}
                onDoubleClick={b.current ? undefined : () => checkout.mutate(b.name)}
                onContextMenu={(e) => localMenu(e, b.name, b.current)}
                draggable
                dropActive={dropTarget === b.name && dragBranch !== b.name}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/cyrex-branch', b.name)
                  setDragBranch(b.name)
                }}
                onDragOver={(e) => {
                  if (dragBranch && dragBranch !== b.name) {
                    e.preventDefault()
                    if (dropTarget !== b.name) setDropTarget(b.name)
                  }
                }}
                onDragLeave={() => setDropTarget((d) => (d === b.name ? null : d))}
                onDrop={(e) => branchDrop(e, b.name)}
                badge={
                  b.ahead || b.behind
                    ? `${b.ahead ? `↑${b.ahead}` : ''}${b.behind ? `↓${b.behind}` : ''}`
                    : undefined
                }
              />
            )
          )
        )}
      </Section>

      <Section
        title={t('sidebar.remoteBranches')}
        icon={Cloud}
        count={remotes.length}
        defaultOpen={false}
      >
        {remotes.length === 0 ? (
          <p className="px-3 py-1 ps-7 text-xs text-fg-subtle">{t('sidebar.empty')}</p>
        ) : (
          remotes.map((b) => (
            <RefRow
              key={b.name}
              name={b.name}
              onDoubleClick={() => checkoutRemote.mutate(b.name)}
              onContextMenu={(e) => remoteMenu(e, b.name)}
            />
          ))
        )}
      </Section>

      <Section title={t('sidebar.tags')} icon={TagIcon} count={tags.data?.length} defaultOpen={false}>
        {!tags.data || tags.data.length === 0 ? (
          <p className="px-3 py-1 ps-7 text-xs text-fg-subtle">{t('sidebar.empty')}</p>
        ) : (
          tags.data.map((tg) => (
            <RefRow key={tg.name} name={tg.name} onDoubleClick={() => checkout.mutate(tg.name)} />
          ))
        )}
      </Section>

      <Section
        title={t('sidebar.stashes')}
        icon={Archive}
        count={stashes.data?.length}
        defaultOpen={false}
      >
        {!stashes.data || stashes.data.length === 0 ? (
          <p className="px-3 py-1 ps-7 text-xs text-fg-subtle">{t('sidebar.empty')}</p>
        ) : (
          stashes.data.map((s) => (
            <div
              key={s.index}
              onDoubleClick={() => stashApply.mutate(s.index)}
              onContextMenu={(e) => stashMenu(e, s.index)}
              title={`${s.message} — double-click to apply`}
              className="group flex cursor-pointer items-center gap-2 px-3 py-1 ps-7 text-xs text-fg hover:bg-surface-2"
            >
              <Archive size={11} strokeWidth={1.75} className="shrink-0 text-fg-subtle" />
              <span className="truncate">{s.message}</span>
            </div>
          ))
        )}
      </Section>

      <Section
        title={t('sidebar.worktrees')}
        icon={FolderTree}
        count={worktrees.data?.length}
        defaultOpen={false}
        action={
          activePath && (
            <button
              type="button"
              onClick={() => setAddingWorktree(true)}
              title={t('worktree.add')}
              aria-label={t('worktree.add')}
              className="rounded-[var(--radius-card)] p-1 text-fg-muted hover:bg-surface-2 hover:text-accent"
            >
              <Plus size={14} strokeWidth={2} />
            </button>
          )
        }
      >
        {!worktrees.data || worktrees.data.length === 0 ? (
          <p className="px-3 py-1 ps-7 text-xs text-fg-subtle">{t('sidebar.empty')}</p>
        ) : (
          worktrees.data.map((wt) => {
            const label = wt.branch ?? (wt.head ? wt.head.slice(0, 7) : wt.path.split('/').pop())
            const badge = wt.isMain
              ? t('worktree.main')
              : wt.locked
                ? t('worktree.locked')
                : wt.detached
                  ? t('worktree.detached')
                  : undefined
            return (
              <div
                key={wt.path}
                onDoubleClick={() => void openWorktree(wt.path)}
                onContextMenu={(e) => worktreeMenu(e, wt)}
                title={`${wt.path} — double-click to open`}
                className={`group flex cursor-pointer items-center gap-2 px-3 py-1 ps-7 text-xs hover:bg-surface-2 ${
                  wt.path === activePath ? 'text-accent' : 'text-fg'
                }`}
              >
                <FolderTree size={11} strokeWidth={1.75} className="shrink-0 text-fg-subtle" />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {badge && (
                  <span className="shrink-0 rounded-[4px] bg-surface-2 px-1 text-[10px] text-fg-subtle">
                    {badge}
                  </span>
                )}
              </div>
            )
          })
        )}
      </Section>

      {addingWorktree && activePath && (
        <AddWorktreeDialog
          repoPath={activePath}
          branches={locals.map((b) => b.name)}
          onClose={() => setAddingWorktree(false)}
        />
      )}

      <ContextMenu state={menu} onClose={() => setMenu(null)} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      {colorPopover && (
        <ColorPopover
          x={colorPopover.x}
          y={colorPopover.y}
          current={repos.find((r) => r.path === colorPopover.path)?.color}
          onPick={(color) => {
            setRepoColor(colorPopover.path, color)
            setColorPopover(null)
          }}
          onClose={() => setColorPopover(null)}
        />
      )}
    </nav>
  )
}
