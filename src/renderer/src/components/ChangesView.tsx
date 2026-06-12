import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Minus, Undo2, Check } from 'lucide-react'
import type { FileStatus } from '@shared/types'
import { useRepoStore } from '../store/repoStore'
import { useDiscard, useStage, useStatus, useUnstage, useWorkingDiff } from '../hooks/useRepo'
import { DiffPanel } from './DiffPanel'
import { CommitBox } from './CommitBox'

const STATUS_LABEL: Record<string, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  conflicted: 'U',
  untracked: '?',
  unknown: ' '
}

function statusColor(code: string): string {
  switch (code) {
    case 'added':
    case 'untracked':
      return 'text-diff-add'
    case 'deleted':
      return 'text-diff-remove'
    case 'conflicted':
      return 'text-conflict'
    case 'renamed':
    case 'copied':
      return 'text-conflict'
    default:
      return 'text-fg-muted'
  }
}

interface Row {
  file: FileStatus
  staged: boolean
  untracked: boolean
}

function FileRow({
  row,
  selected,
  onSelect,
  onPrimary,
  onDiscard
}: {
  row: Row
  selected: boolean
  onSelect: () => void
  onPrimary: () => void
  onDiscard?: () => void
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const code = row.untracked
    ? 'untracked'
    : row.staged
      ? row.file.index
      : row.file.workingTree

  return (
    <div
      className={`group flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-surface-2 ${
        selected ? 'bg-surface-2' : ''
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-start"
        title={row.file.path}
      >
        <span className={`w-3 shrink-0 text-center font-mono font-semibold ${statusColor(code)}`}>
          {STATUS_LABEL[code] ?? ' '}
        </span>
        <span className="min-w-0 truncate font-mono text-fg">
          {row.file.origPath && row.file.origPath !== row.file.path
            ? `${row.file.origPath} → ${row.file.path}`
            : row.file.path}
        </span>
      </button>

      {onDiscard &&
        (confirming ? (
          <button
            type="button"
            onClick={() => {
              onDiscard()
              setConfirming(false)
            }}
            className="shrink-0 rounded-[var(--radius-card)] bg-danger px-1.5 py-0.5 text-[10px] text-white"
            title="Confirm discard"
          >
            Discard?
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="shrink-0 rounded-[var(--radius-card)] p-0.5 text-fg-subtle opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
            title="Discard changes (destructive)"
          >
            <Undo2 size={14} strokeWidth={1.75} />
          </button>
        ))}

      <button
        type="button"
        onClick={onPrimary}
        className="shrink-0 rounded-[var(--radius-card)] p-0.5 text-fg-subtle hover:bg-surface hover:text-accent"
        title={row.staged ? 'Unstage' : 'Stage'}
      >
        {row.staged ? <Minus size={14} strokeWidth={2} /> : <Plus size={14} strokeWidth={2} />}
      </button>
    </div>
  )
}

function SectionHeader({
  label,
  count,
  action
}: {
  label: string
  count: number
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 bg-surface px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted">
      <span>{label}</span>
      <span className="text-fg-subtle">{count}</span>
      <span className="ms-auto">{action}</span>
    </div>
  )
}

export function ChangesView({ repoPath }: { repoPath: string }): React.JSX.Element {
  const { t } = useTranslation()
  const { data: status } = useStatus(repoPath)
  const selectedFile = useRepoStore((s) => s.selectedFile)
  const selectFile = useRepoStore((s) => s.selectFile)

  const stage = useStage(repoPath)
  const unstage = useUnstage(repoPath)
  const discard = useDiscard(repoPath)

  const diff = useWorkingDiff(
    repoPath,
    selectedFile?.file ?? null,
    selectedFile?.staged ?? false,
    selectedFile?.untracked ?? false
  )

  const stagedRows: Row[] = (status?.staged ?? []).map((file) => ({
    file,
    staged: true,
    untracked: false
  }))
  const unstagedRows: Row[] = [
    ...(status?.conflicted ?? []).map((file) => ({ file, staged: false, untracked: false })),
    ...(status?.unstaged ?? []).map((file) => ({ file, staged: false, untracked: false })),
    ...(status?.untracked ?? []).map((file) => ({ file, staged: false, untracked: true }))
  ]

  const isSelected = (r: Row): boolean =>
    selectedFile?.file === r.file.path && selectedFile?.staged === r.staged

  const select = (r: Row): void =>
    selectFile({ file: r.file.path, staged: r.staged, untracked: r.untracked })

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-80 shrink-0 flex-col border-r border-border bg-surface">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SectionHeader
            label={t('status.staged')}
            count={stagedRows.length}
            action={
              stagedRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => stagedRows.forEach((r) => unstage.mutate(r.file.path))}
                  className="text-[10px] text-fg-muted hover:text-accent"
                >
                  {t('changes.unstageAll')}
                </button>
              )
            }
          />
          {stagedRows.length === 0 ? (
            <p className="px-2 py-1 text-xs text-fg-subtle">{t('sidebar.empty')}</p>
          ) : (
            stagedRows.map((r) => (
              <FileRow
                key={`s:${r.file.path}`}
                row={r}
                selected={isSelected(r)}
                onSelect={() => select(r)}
                onPrimary={() => unstage.mutate(r.file.path)}
              />
            ))
          )}

          <SectionHeader
            label={t('status.unstaged')}
            count={unstagedRows.length}
            action={
              unstagedRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => unstagedRows.forEach((r) => stage.mutate(r.file.path))}
                  className="text-[10px] text-fg-muted hover:text-accent"
                >
                  {t('changes.stageAll')}
                </button>
              )
            }
          />
          {unstagedRows.length === 0 ? (
            <p className="px-2 py-1 text-xs text-fg-subtle">{t('sidebar.empty')}</p>
          ) : (
            unstagedRows.map((r) => (
              <FileRow
                key={`u:${r.file.path}`}
                row={r}
                selected={isSelected(r)}
                onSelect={() => select(r)}
                onPrimary={() => stage.mutate(r.file.path)}
                onDiscard={() => discard.mutate({ file: r.file.path, untracked: r.untracked })}
              />
            ))
          )}
        </div>

        <CommitBox repoPath={repoPath} stagedCount={stagedRows.length} branch={status?.branch ?? null} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {selectedFile ? (
          <DiffPanel
            files={diff.data?.files}
            isLoading={diff.isLoading}
            error={diff.error as Error | null}
            title={selectedFile.file}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            <p className="max-w-[260px] text-xs text-fg-subtle">
              {status?.clean ? (
                <span className="flex items-center justify-center gap-1.5 text-diff-add">
                  <Check size={14} strokeWidth={2} />
                  {t('status.clean')}
                </span>
              ) : (
                t('changes.selectPrompt')
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
