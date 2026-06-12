import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Columns2, AlignLeft, FileDiff, Plus, Minus, Undo2, X } from 'lucide-react'
import type { DiffFile, DiffLine } from '@shared/types'

type ViewMode = 'inline' | 'split'
export type PartialOp = 'stage' | 'unstage' | 'discard'

/** Interactive staging callbacks; absent for read-only (commit) diffs. */
export interface DiffActions {
  /** True when this panel shows staged changes (index vs HEAD). */
  staged: boolean
  onHunk: (hunkIndex: number, op: PartialOp) => void
  onLines: (hunkIndex: number, lineIndices: number[], op: PartialOp) => void
}

const STATUS_LABEL: Record<string, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  conflicted: 'U',
  untracked: '?',
  ignored: '!',
  unknown: ' '
}

function statusColor(status: string): string {
  switch (status) {
    case 'added':
    case 'untracked':
      return 'text-diff-add'
    case 'deleted':
      return 'text-diff-remove'
    case 'renamed':
    case 'copied':
      return 'text-conflict'
    default:
      return 'text-fg-muted'
  }
}

function lineBg(kind: DiffLine['kind']): string {
  if (kind === 'add') return 'bg-[var(--color-diff-add-bg)]'
  if (kind === 'remove') return 'bg-[var(--color-diff-remove-bg)]'
  return ''
}

function gutterMark(kind: DiffLine['kind']): string {
  if (kind === 'add') return '+'
  if (kind === 'remove') return '-'
  return ' '
}

function Num({ n }: { n?: number }): React.JSX.Element {
  return (
    <span className="inline-block w-10 shrink-0 select-none pe-2 text-end text-fg-subtle">
      {n ?? ''}
    </span>
  )
}

function toRows(lines: DiffLine[]): { left?: DiffLine; right?: DiffLine }[] {
  const rows: { left?: DiffLine; right?: DiffLine }[] = []
  let rem: DiffLine[] = []
  let add: DiffLine[] = []
  const flush = (): void => {
    const n = Math.max(rem.length, add.length)
    for (let i = 0; i < n; i++) rows.push({ left: rem[i], right: add[i] })
    rem = []
    add = []
  }
  for (const l of lines) {
    if (l.kind === 'remove') rem.push(l)
    else if (l.kind === 'add') add.push(l)
    else {
      flush()
      rows.push({ left: l, right: l })
    }
  }
  flush()
  return rows
}

function InlineHunkLine({
  line,
  selectable,
  selected,
  onToggle
}: {
  line: DiffLine
  selectable: boolean
  selected: boolean
  onToggle?: () => void
}): React.JSX.Element {
  const ring = selected ? 'outline outline-1 -outline-offset-1 outline-accent' : ''
  return (
    <div
      onClick={selectable ? onToggle : undefined}
      className={`flex font-mono text-[12px] leading-5 ${lineBg(line.kind)} ${ring} ${
        selectable ? 'cursor-pointer' : ''
      }`}
    >
      <Num n={line.oldNumber} />
      <Num n={line.newNumber} />
      <span className="w-4 shrink-0 select-none text-center text-fg-subtle">
        {gutterMark(line.kind)}
      </span>
      <span className="whitespace-pre">{line.content || ' '}</span>
    </div>
  )
}

function SplitCell({ line }: { line?: DiffLine }): React.JSX.Element {
  if (!line) return <div className="flex-1 bg-surface-2/30" />
  const num = line.kind === 'add' ? line.newNumber : line.oldNumber
  return (
    <div className={`flex min-w-0 flex-1 font-mono text-[12px] leading-5 ${lineBg(line.kind)}`}>
      <Num n={num} />
      <span className="w-3 shrink-0 select-none text-center text-fg-subtle">
        {gutterMark(line.kind)}
      </span>
      <span className="whitespace-pre">{line.content || ' '}</span>
    </div>
  )
}

function HunkActionButton({
  onClick,
  title,
  icon: Icon,
  danger
}: {
  onClick: () => void
  title: string
  icon: typeof Plus
  danger?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`rounded-[var(--radius-card)] p-0.5 text-fg-subtle transition-colors hover:bg-surface ${
        danger ? 'hover:text-danger' : 'hover:text-accent'
      }`}
    >
      <Icon size={13} strokeWidth={2} />
    </button>
  )
}

function FileBlock({
  file,
  fileHunkBase,
  mode,
  actions
}: {
  file: DiffFile
  /** Index of this file's first hunk in the engine's view (single-file = 0). */
  fileHunkBase: number
  mode: ViewMode
  actions?: DiffActions
}): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const [sel, setSel] = useState<{ hunk: number; lines: Set<number> } | null>(null)
  const [confirmHunk, setConfirmHunk] = useState<number | null>(null)

  const toggleLine = (hunkIndex: number, lineIndex: number): void => {
    setSel((prev) => {
      if (!prev || prev.hunk !== hunkIndex) return { hunk: hunkIndex, lines: new Set([lineIndex]) }
      const lines = new Set(prev.lines)
      if (lines.has(lineIndex)) lines.delete(lineIndex)
      else lines.add(lineIndex)
      return lines.size === 0 ? null : { hunk: hunkIndex, lines }
    })
  }

  const applyLines = (): void => {
    if (!sel || !actions) return
    const op: PartialOp = actions.staged ? 'unstage' : 'stage'
    actions.onLines(sel.hunk, [...sel.lines].sort((a, b) => a - b), op)
    setSel(null)
  }

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 bg-surface-2/40 px-3 py-1.5 text-start text-xs hover:bg-surface-2"
      >
        <span className={`w-3 shrink-0 font-mono font-semibold ${statusColor(file.status)}`}>
          {STATUS_LABEL[file.status] ?? ' '}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-fg" title={file.path}>
          {file.oldPath && file.oldPath !== file.path ? `${file.oldPath} → ${file.path}` : file.path}
        </span>
        {file.additions > 0 && <span className="text-diff-add">+{file.additions}</span>}
        {file.deletions > 0 && <span className="text-diff-remove">-{file.deletions}</span>}
      </button>

      {actions && sel && (
        <div className="flex items-center gap-2 border-b border-border bg-accent/10 px-3 py-1 text-xs">
          <span className="text-fg">
            {t('changes.linesSelected', { count: sel.lines.size })}
          </span>
          <button
            type="button"
            onClick={applyLines}
            className="ms-auto rounded-[var(--radius-card)] bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-fg hover:bg-accent-hover"
          >
            {actions.staged
              ? t('changes.unstageLines', { count: sel.lines.size })
              : t('changes.stageLines', { count: sel.lines.size })}
          </button>
          <button type="button" onClick={() => setSel(null)} title={t('changes.clear')}>
            <X size={13} className="text-fg-muted hover:text-fg" />
          </button>
        </div>
      )}

      {open && (
        <div className="overflow-x-auto">
          {file.binary ? (
            <p className="px-3 py-2 text-xs italic text-fg-subtle">{t('diff.binary')}</p>
          ) : file.hunks.length === 0 ? (
            <p className="px-3 py-2 text-xs italic text-fg-subtle">{t('diff.noChanges')}</p>
          ) : (
            file.hunks.map((hunk, hi) => {
              const engineHunk = fileHunkBase + hi
              const selectableInline = !!actions && mode === 'inline'
              return (
                <div key={hi} className="min-w-max">
                  <div className="flex items-center gap-2 bg-surface-2/60 px-3 py-0.5 font-mono text-[11px] text-fg-subtle">
                    <span className="min-w-0 flex-1 truncate">{hunk.header}</span>
                    {actions && (
                      <span className="flex items-center gap-0.5">
                        {actions.staged ? (
                          <HunkActionButton
                            onClick={() => actions.onHunk(engineHunk, 'unstage')}
                            title={t('changes.unstageHunk')}
                            icon={Minus}
                          />
                        ) : (
                          <>
                            <HunkActionButton
                              onClick={() => actions.onHunk(engineHunk, 'stage')}
                              title={t('changes.stageHunk')}
                              icon={Plus}
                            />
                            {confirmHunk === engineHunk ? (
                              <button
                                type="button"
                                onClick={() => {
                                  actions.onHunk(engineHunk, 'discard')
                                  setConfirmHunk(null)
                                }}
                                className="rounded-[var(--radius-card)] bg-danger px-1.5 text-[10px] text-white"
                              >
                                {t('changes.discardConfirm')}
                              </button>
                            ) : (
                              <HunkActionButton
                                onClick={() => setConfirmHunk(engineHunk)}
                                title={t('changes.discardHunk')}
                                icon={Undo2}
                                danger
                              />
                            )}
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  {mode === 'inline'
                    ? hunk.lines.map((l, li) => (
                        <InlineHunkLine
                          key={li}
                          line={l}
                          selectable={selectableInline && l.kind !== 'context'}
                          selected={sel?.hunk === engineHunk && sel.lines.has(li)}
                          onToggle={() => toggleLine(engineHunk, li)}
                        />
                      ))
                    : toRows(hunk.lines).map((row, ri) => (
                        <div key={ri} className="flex">
                          <SplitCell line={row.left} />
                          <span className="w-px shrink-0 bg-border" />
                          <SplitCell line={row.right} />
                        </div>
                      ))}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  label,
  icon: Icon
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: typeof Columns2
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`rounded-[var(--radius-card)] p-1 transition-colors ${
        active ? 'bg-surface-2 text-accent' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
      }`}
    >
      <Icon size={15} strokeWidth={1.75} />
    </button>
  )
}

/**
 * Presentational diff renderer shared by commit diffs (read-only) and
 * working-tree diffs. When `actions` is provided it adds per-hunk stage/unstage/
 * discard buttons and inline line selection for partial staging.
 */
export function DiffPanel({
  files,
  isLoading,
  error,
  title,
  actions
}: {
  files: DiffFile[] | undefined
  isLoading: boolean
  error: Error | null
  title?: string
  actions?: DiffActions
}): React.JSX.Element {
  const { t } = useTranslation()
  const [mode, setMode] = useState<ViewMode>('inline')

  const totalAdd = files?.reduce((s, f) => s + f.additions, 0) ?? 0
  const totalDel = files?.reduce((s, f) => s + f.deletions, 0) ?? 0

  // Hunk indices are global across the file list as the engine sees them.
  let hunkBase = 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-y border-border bg-surface px-3 text-xs text-fg-muted">
        <FileDiff size={14} strokeWidth={1.75} />
        <span className="font-medium uppercase tracking-wide">
          {title ?? t('detail.changedFiles')}
        </span>
        {files && (
          <span className="text-fg-subtle">
            {files.length} · <span className="text-diff-add">+{totalAdd}</span>{' '}
            <span className="text-diff-remove">-{totalDel}</span>
          </span>
        )}
        <div className="ms-auto flex items-center gap-0.5">
          <ModeButton
            active={mode === 'inline'}
            onClick={() => setMode('inline')}
            label={t('diff.inline')}
            icon={AlignLeft}
          />
          <ModeButton
            active={mode === 'split'}
            onClick={() => setMode('split')}
            label={t('diff.split')}
            icon={Columns2}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading && <p className="p-3 text-xs text-fg-subtle">{t('diff.loading')}</p>}
        {error && <p className="p-3 text-xs text-danger">{error.message}</p>}
        {files && files.length === 0 && !isLoading && (
          <p className="p-3 text-xs text-fg-subtle">{t('diff.empty')}</p>
        )}
        {files?.map((file) => {
          const base = hunkBase
          hunkBase += file.hunks.length
          return (
            <FileBlock
              key={`${file.oldPath ?? ''}:${file.path}`}
              file={file}
              fileHunkBase={base}
              mode={mode}
              actions={actions}
            />
          )
        })}
      </div>
    </div>
  )
}
