import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, GitMerge } from 'lucide-react'
import type { ConflictFile, ConflictSegment } from '@shared/types'
import { useConflict, useResolveConflict, useResolveSide } from '../hooks/useRepo'
import { useRepoStore } from '../store/repoStore'

type Choice = 'ours' | 'theirs' | 'both'

/** Build the resolved file text from each segment's chosen content. */
function assemble(segments: ConflictSegment[], choices: Record<number, Choice>): string {
  const out: string[] = []
  segments.forEach((seg, i) => {
    if (seg.type === 'context') {
      out.push(...seg.lines)
      return
    }
    const c = choices[i]
    if (c === 'ours' || c === 'both') out.push(...seg.ours)
    if (c === 'theirs' || c === 'both') out.push(...seg.theirs)
  })
  return out.join('\n')
}

function SideLines({
  lines,
  active,
  tone
}: {
  lines: string[]
  active: boolean
  tone: 'ours' | 'theirs'
}): React.JSX.Element {
  const bar = tone === 'ours' ? 'bg-diff-add' : 'bg-lane-1'
  return (
    <div className={`min-w-0 flex-1 ${active ? '' : 'opacity-40'}`}>
      {lines.length === 0 ? (
        <div className="px-3 py-1 font-mono text-[11px] italic text-fg-subtle">∅</div>
      ) : (
        lines.map((l, i) => (
          <div key={i} className="flex">
            <span className={`w-0.5 shrink-0 ${active ? bar : 'bg-transparent'}`} aria-hidden />
            <span className="whitespace-pre-wrap break-all px-2.5 py-px font-mono text-[12px] text-fg">
              {l || ' '}
            </span>
          </div>
        ))
      )}
    </div>
  )
}

function ChoiceButton({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[var(--radius-card)] px-2 py-0.5 text-[11px] font-medium transition-colors ${
        active
          ? 'bg-accent text-accent-fg'
          : 'bg-surface-2 text-fg-muted hover:bg-surface hover:text-fg'
      }`}
    >
      {label}
    </button>
  )
}

function ContextBlock({ lines }: { lines: string[] }): React.JSX.Element | null {
  // Trim a long unconflicted run to keep focus on the conflicts; the full text
  // is still written out on resolve regardless of what we show here.
  const MAX = 6
  const shown = lines.length > MAX ? [...lines.slice(0, 3), '⋯', ...lines.slice(-2)] : lines
  if (lines.length === 0) return null
  return (
    <div className="py-0.5">
      {shown.map((l, i) => (
        <div
          key={i}
          className="whitespace-pre-wrap break-all px-3 py-px font-mono text-[12px] text-fg-subtle"
        >
          {l === '⋯' ? <span className="select-none text-fg-subtle">⋯</span> : l || ' '}
        </div>
      ))}
    </div>
  )
}

export function ConflictEditor({
  repoPath,
  file
}: {
  repoPath: string
  file: string
}): React.JSX.Element {
  const { t } = useTranslation()
  const { data, isLoading, error } = useConflict(repoPath, file)
  const resolve = useResolveConflict(repoPath)
  const resolveSide = useResolveSide(repoPath)
  const selectFile = useRepoStore((s) => s.selectFile)
  const [choices, setChoices] = useState<Record<number, Choice>>({})

  // Reset choices whenever a different file's conflict data loads.
  const conflictIndices = useMemo(
    () =>
      (data?.segments ?? [])
        .map((s, i) => (s.type === 'conflict' ? i : -1))
        .filter((i) => i >= 0),
    [data]
  )

  if (isLoading) return <Centered text={t('graph.loading')} />
  if (error) return <Centered text={(error as Error).message} tone="danger" />
  if (!data) return <Centered text={t('diff.empty')} />

  const setChoice = (i: number, c: Choice): void => setChoices((prev) => ({ ...prev, [i]: c }))
  const setAll = (c: Choice): void =>
    setChoices(Object.fromEntries(conflictIndices.map((i) => [i, c])))

  const allChosen = conflictIndices.every((i) => choices[i] !== undefined)

  const markResolved = (): void => {
    resolve.mutate(
      { file, content: assemble(data.segments, choices) },
      { onSuccess: () => selectFile(null) }
    )
  }

  // Binary or marker-free conflict: only whole-side resolution is possible.
  const binary = (data as ConflictFile).conflicts === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <GitMerge size={14} strokeWidth={1.75} className="shrink-0 text-conflict" />
        <span className="min-w-0 truncate font-mono text-xs text-fg" title={file}>
          {file}
        </span>
        <span className="shrink-0 text-[11px] text-fg-subtle">
          {t('conflict.count', { count: data.conflicts })}
        </span>
        <div className="ms-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => resolveSide.mutate({ file, side: 'ours' })}
            className="rounded-[var(--radius-card)] bg-surface-2 px-2 py-1 text-[11px] text-fg-muted hover:text-fg"
          >
            {t('conflict.useOursFile')}
          </button>
          <button
            type="button"
            onClick={() => resolveSide.mutate({ file, side: 'theirs' })}
            className="rounded-[var(--radius-card)] bg-surface-2 px-2 py-1 text-[11px] text-fg-muted hover:text-fg"
          >
            {t('conflict.useTheirsFile')}
          </button>
        </div>
      </div>

      {!binary && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-1.5 text-[11px]">
          <span className="text-fg-muted">{t('conflict.takeAll')}</span>
          <ChoiceButton label={t('conflict.ours')} active={false} onClick={() => setAll('ours')} />
          <ChoiceButton label={t('conflict.both')} active={false} onClick={() => setAll('both')} />
          <ChoiceButton
            label={t('conflict.theirs')}
            active={false}
            onClick={() => setAll('theirs')}
          />
          <button
            type="button"
            onClick={markResolved}
            disabled={!allChosen || resolve.isPending}
            className="ms-auto flex items-center gap-1.5 rounded-[var(--radius-card)] bg-accent px-2.5 py-1 font-medium text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check size={13} strokeWidth={2.5} />
            {t('conflict.markResolved')}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {binary ? (
          <Centered text={t('conflict.binary')} />
        ) : (
          data.segments.map((seg, i) =>
            seg.type === 'context' ? (
              <ContextBlock key={i} lines={seg.lines} />
            ) : (
              <div key={i} className="my-1.5 overflow-hidden rounded-[var(--radius-card)] border border-conflict/40">
                <div className="flex items-center gap-1.5 bg-conflict/10 px-2.5 py-1 text-[11px]">
                  <span className="font-medium text-conflict">
                    {t('conflict.hunk', { n: conflictIndices.indexOf(i) + 1 })}
                  </span>
                  <div className="ms-auto flex items-center gap-1.5">
                    <ChoiceButton
                      label={t('conflict.ours')}
                      active={choices[i] === 'ours'}
                      onClick={() => setChoice(i, 'ours')}
                    />
                    <ChoiceButton
                      label={t('conflict.both')}
                      active={choices[i] === 'both'}
                      onClick={() => setChoice(i, 'both')}
                    />
                    <ChoiceButton
                      label={t('conflict.theirs')}
                      active={choices[i] === 'theirs'}
                      onClick={() => setChoice(i, 'theirs')}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 divide-x divide-border">
                  <div>
                    <div className="bg-surface px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
                      {t('conflict.current')}
                    </div>
                    <SideLines
                      lines={seg.ours}
                      tone="ours"
                      active={choices[i] === 'ours' || choices[i] === 'both'}
                    />
                  </div>
                  <div>
                    <div className="bg-surface px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
                      {t('conflict.incoming')}
                    </div>
                    <SideLines
                      lines={seg.theirs}
                      tone="theirs"
                      active={choices[i] === 'theirs' || choices[i] === 'both'}
                    />
                  </div>
                </div>
              </div>
            )
          )
        )}
      </div>
    </div>
  )
}

function Centered({ text, tone }: { text: string; tone?: 'danger' }): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-xs">
      <span className={tone === 'danger' ? 'text-danger' : 'text-fg-subtle'}>{text}</span>
    </div>
  )
}
