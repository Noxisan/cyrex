import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Columns2, AlignLeft, FileDiff } from 'lucide-react'
import type { DiffFile, DiffLine } from '@shared/types'

type ViewMode = 'inline' | 'split'

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

/** Pair removed/added lines into left/right rows for side-by-side rendering. */
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

function InlineHunkLine({ line }: { line: DiffLine }): React.JSX.Element {
  return (
    <div className={`flex font-mono text-[12px] leading-5 ${lineBg(line.kind)}`}>
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

function FileBlock({ file, mode }: { file: DiffFile; mode: ViewMode }): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)

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

      {open && (
        <div className="overflow-x-auto">
          {file.binary ? (
            <p className="px-3 py-2 text-xs italic text-fg-subtle">{t('diff.binary')}</p>
          ) : file.hunks.length === 0 ? (
            <p className="px-3 py-2 text-xs italic text-fg-subtle">{t('diff.noChanges')}</p>
          ) : (
            file.hunks.map((hunk, hi) => (
              <div key={hi} className="min-w-max">
                <div className="bg-surface-2/60 px-3 py-0.5 font-mono text-[11px] text-fg-subtle">
                  {hunk.header}
                </div>
                {mode === 'inline'
                  ? hunk.lines.map((l, li) => <InlineHunkLine key={li} line={l} />)
                  : toRows(hunk.lines).map((row, ri) => (
                      <div key={ri} className="flex">
                        <SplitCell line={row.left} />
                        <span className="w-px shrink-0 bg-border" />
                        <SplitCell line={row.right} />
                      </div>
                    ))}
              </div>
            ))
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
 * Presentational diff renderer shared by commit diffs and working-tree diffs.
 * Pure view: it receives parsed DiffFile[] and render/loading/error state and
 * owns only the inline/side-by-side toggle.
 */
export function DiffPanel({
  files,
  isLoading,
  error,
  title
}: {
  files: DiffFile[] | undefined
  isLoading: boolean
  error: Error | null
  title?: string
}): React.JSX.Element {
  const { t } = useTranslation()
  const [mode, setMode] = useState<ViewMode>('inline')

  const totalAdd = files?.reduce((s, f) => s + f.additions, 0) ?? 0
  const totalDel = files?.reduce((s, f) => s + f.deletions, 0) ?? 0

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
        {files?.map((file) => (
          <FileBlock key={`${file.oldPath ?? ''}:${file.path}`} file={file} mode={mode} />
        ))}
      </div>
    </div>
  )
}
