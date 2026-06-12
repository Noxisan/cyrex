import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { computeLayout } from '@shared/graph'
import type { Commit } from '@shared/types'
import { useCherryPick, useLog, useRevert } from '../hooks/useRepo'
import { useRepoStore } from '../store/repoStore'
import { ContextMenu } from './ContextMenu'
import type { MenuState } from './ContextMenu'

const ROW_H = 30
const LANE_W = 15
const LEFT_PAD = 10
const DOT_R = 4

const LANE_VARS = [
  '--color-lane-0',
  '--color-lane-1',
  '--color-lane-2',
  '--color-lane-3',
  '--color-lane-4',
  '--color-lane-5'
]
const laneColor = (lane: number): string => `var(${LANE_VARS[lane % LANE_VARS.length]})`

function RefBadge({ name }: { name: string }): React.JSX.Element {
  const isHead = name === 'HEAD' || name.startsWith('HEAD ->')
  const isTag = name.startsWith('tag:')
  const label = name.replace(/^tag:\s*/, '').replace(/^HEAD ->\s*/, '')
  return (
    <span
      className={`rounded-[var(--radius-card)] px-1.5 py-0.5 text-[10px] font-medium ${
        isHead
          ? 'bg-accent/15 text-accent'
          : isTag
            ? 'bg-conflict/15 text-conflict'
            : 'bg-surface-2 text-fg-muted'
      }`}
    >
      {label}
    </span>
  )
}

function GraphColumn({
  commits,
  width
}: {
  commits: Commit[]
  width: number
}): React.JSX.Element {
  const layout = useMemo(() => computeLayout(commits), [commits])
  const x = (lane: number): number => LEFT_PAD + lane * LANE_W + LANE_W / 2
  const y = (row: number): number => row * ROW_H + ROW_H / 2

  return (
    <svg
      width={width}
      height={commits.length * ROW_H}
      className="shrink-0"
      style={{ pointerEvents: 'none' }}
    >
      {layout.edges.map((e, i) => {
        const x1 = x(e.fromLane)
        const y1 = y(e.fromRow)
        const x2 = x(e.toLane)
        const y2 = y(e.toRow)
        const midY = (y1 + y2) / 2
        const d =
          x1 === x2
            ? `M ${x1} ${y1} L ${x2} ${y2}`
            : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={laneColor(e.toLane)}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        )
      })}
      {layout.nodes.map((n) => (
        <circle
          key={n.sha}
          cx={x(n.lane)}
          cy={y(n.row)}
          r={DOT_R}
          fill="var(--color-bg)"
          stroke={laneColor(n.lane)}
          strokeWidth={2.2}
        />
      ))}
    </svg>
  )
}

export function GraphView({ repoPath }: { repoPath: string }): React.JSX.Element {
  const { t } = useTranslation()
  const { data: commits, isLoading, error } = useLog(repoPath, { limit: 300 })
  const selectedSha = useRepoStore((s) => s.selectedSha)
  const selectCommit = useRepoStore((s) => s.selectCommit)
  const cherryPick = useCherryPick(repoPath)
  const revert = useRevert(repoPath)
  const [menu, setMenu] = useState<MenuState | null>(null)

  const commitMenu = (e: React.MouseEvent, sha: string): void => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: t('commit.cherryPick'), onClick: () => cherryPick.mutate(sha) },
        { label: t('commit.revert'), onClick: () => revert.mutate(sha) }
      ]
    })
  }

  const graphWidth = useMemo(() => {
    if (!commits) return LEFT_PAD * 2
    const layout = computeLayout(commits)
    return LEFT_PAD * 2 + layout.laneCount * LANE_W
  }, [commits])

  if (isLoading) {
    return <Centered text={t('graph.loading')} />
  }
  if (error) {
    return <Centered text={(error as Error).message} tone="danger" />
  }
  if (!commits || commits.length === 0) {
    return <Centered text={t('graph.empty')} />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center border-b border-border px-4 text-xs font-medium uppercase tracking-wide text-fg-muted">
        {t('graph.title')}
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto">
        <div className="flex" style={{ minHeight: commits.length * ROW_H }}>
          <GraphColumn commits={commits} width={graphWidth} />
          {/* min-width keeps the commit rows from collapsing when the graph
              column is wide (deep/branchy history); the panel scrolls instead. */}
          <div className="min-w-[340px] flex-1">
            {commits.map((c, row) => (
              <button
                key={c.sha}
                type="button"
                onClick={() => selectCommit(c.sha)}
                onContextMenu={(e) => commitMenu(e, c.sha)}
                style={{ height: ROW_H }}
                className={`flex w-full items-center gap-2 px-3 text-start text-xs hover:bg-surface-2 ${
                  selectedSha === c.sha ? 'bg-surface-2' : ''
                } ${row === 0 ? '' : 'border-t border-border/30'}`}
              >
                {c.refs.length > 0 && (
                  <span className="flex shrink-0 gap-1">
                    {c.refs.map((r) => (
                      <RefBadge key={r} name={r} />
                    ))}
                  </span>
                )}
                <span className="truncate text-fg">{c.summary}</span>
                <span className="ms-auto shrink-0 truncate text-fg-subtle">{c.author.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{c.shortSha}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  )
}

function Centered({
  text,
  tone
}: {
  text: string
  tone?: 'danger'
}): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-xs">
      <span className={tone === 'danger' ? 'text-danger' : 'text-fg-subtle'}>{text}</span>
    </div>
  )
}
