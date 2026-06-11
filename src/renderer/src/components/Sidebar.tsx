import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Cloud,
  Tag as TagIcon,
  Archive,
  FolderGit2
} from 'lucide-react'
import { useRepoStore } from '../store/repoStore'
import { useBranches, useTags } from '../hooks/useRepo'

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
  children,
  defaultOpen = true
}: {
  title: string
  icon: typeof GitBranch
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-border/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-fg-muted hover:text-fg"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Icon size={14} strokeWidth={1.75} />
        <span className="flex-1 text-start uppercase tracking-wide">{title}</span>
        {count !== undefined && <span className="text-fg-subtle">{count}</span>}
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  )
}

function RefRow({
  name,
  current,
  badge
}: {
  name: string
  current?: boolean
  badge?: string
}): React.JSX.Element {
  return (
    <div
      className={`group flex items-center gap-2 px-3 py-1 ps-7 text-xs hover:bg-surface-2 ${
        current ? 'text-accent' : 'text-fg'
      }`}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: colorFor(name) }} />
      <span className="truncate" title={name}>
        {name}
      </span>
      {badge && <span className="ms-auto text-[10px] text-fg-subtle">{badge}</span>}
    </div>
  )
}

export function Sidebar(): React.JSX.Element {
  const { t } = useTranslation()
  const { repos, activePath, setActive } = useRepoStore()
  const branches = useBranches(activePath)
  const tags = useTags(activePath)

  const locals = branches.data?.filter((b) => b.kind === 'local') ?? []
  const remotes = branches.data?.filter((b) => b.kind === 'remote') ?? []

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

      <Section title={t('sidebar.localBranches')} icon={GitBranch} count={locals.length}>
        {locals.length === 0 ? (
          <p className="px-3 py-1 ps-7 text-xs text-fg-subtle">{t('sidebar.empty')}</p>
        ) : (
          locals.map((b) => (
            <RefRow
              key={b.name}
              name={b.name}
              current={b.current}
              badge={
                b.ahead || b.behind
                  ? `${b.ahead ? `↑${b.ahead}` : ''}${b.behind ? `↓${b.behind}` : ''}`
                  : undefined
              }
            />
          ))
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
          remotes.map((b) => <RefRow key={b.name} name={b.name} />)
        )}
      </Section>

      <Section title={t('sidebar.tags')} icon={TagIcon} count={tags.data?.length} defaultOpen={false}>
        {!tags.data || tags.data.length === 0 ? (
          <p className="px-3 py-1 ps-7 text-xs text-fg-subtle">{t('sidebar.empty')}</p>
        ) : (
          tags.data.map((tg) => <RefRow key={tg.name} name={tg.name} />)
        )}
      </Section>

      <Section title={t('sidebar.stashes')} icon={Archive} count={0} defaultOpen={false}>
        <p className="px-3 py-1 ps-7 text-xs text-fg-subtle">{t('sidebar.empty')}</p>
      </Section>
    </nav>
  )
}
