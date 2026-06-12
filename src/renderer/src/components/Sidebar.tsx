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
  Plus,
  Check
} from 'lucide-react'
import { useRepoStore } from '../store/repoStore'
import {
  useBranches,
  useCheckout,
  useCheckoutRemote,
  useCreateBranch,
  useDeleteBranch,
  useRenameBranch,
  useStashApply,
  useStashDrop,
  useStashes,
  useStashPop,
  useTags
} from '../hooks/useRepo'
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
  onContextMenu
}: {
  name: string
  current?: boolean
  badge?: string
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}): React.JSX.Element {
  return (
    <div
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      title={current ? name : `${name} — double-click to check out`}
      className={`group flex items-center gap-2 px-3 py-1 ps-7 text-xs hover:bg-surface-2 ${
        onDoubleClick ? 'cursor-pointer' : ''
      } ${current ? 'text-accent' : 'text-fg'}`}
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

export function Sidebar(): React.JSX.Element {
  const { t } = useTranslation()
  const { repos, activePath, setActive } = useRepoStore()
  const branches = useBranches(activePath)
  const tags = useTags(activePath)
  const stashes = useStashes(activePath)

  const path = activePath ?? ''
  const checkout = useCheckout(path)
  const checkoutRemote = useCheckoutRemote(path)
  const createBranch = useCreateBranch(path)
  const renameBranch = useRenameBranch(path)
  const deleteBranch = useDeleteBranch(path)
  const stashApply = useStashApply(path)
  const stashPop = useStashPop(path)
  const stashDrop = useStashDrop(path)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)

  const locals = branches.data?.filter((b) => b.kind === 'local') ?? []
  const remotes = branches.data?.filter((b) => b.kind === 'remote') ?? []

  const localMenu = (e: React.MouseEvent, name: string, current: boolean): void => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: t('branch.checkout'), onClick: () => checkout.mutate(name), disabled: current },
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

  return (
    <nav className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface">
      <Section title={t('sidebar.repositories')} icon={FolderGit2} count={repos.length}>
        {repos.length === 0 ? (
          <p className="px-3 py-1 ps-7 text-xs text-fg-subtle">{t('sidebar.empty')}</p>
        ) : (
          repos.map((r) => (
            <button
              key={r.path}
              type="button"
              onClick={() => setActive(r.path)}
              className={`flex w-full items-center gap-2 px-3 py-1 ps-7 text-start text-xs hover:bg-surface-2 ${
                r.path === activePath ? 'text-accent' : 'text-fg'
              }`}
              title={r.path}
            >
              <span className="truncate">{r.name}</span>
            </button>
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

      <ContextMenu state={menu} onClose={() => setMenu(null)} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </nav>
  )
}
