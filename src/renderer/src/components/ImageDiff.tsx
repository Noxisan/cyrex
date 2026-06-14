import { useTranslation } from 'react-i18next'
import type { DiffFile, DiffSource, ImageInfo } from '@shared/types'
import { useImageVersions } from '../hooks/useRepo'

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|ico|svg|avif)$/i

/** True when a path looks like a previewable image (mirrors the main-side list). */
export function isImagePath(path: string): boolean {
  return IMAGE_RE.test(path)
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// A subtle checkerboard so transparent images read clearly against any theme.
const CHECKER: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, var(--color-surface-2) 25%, transparent 25%), linear-gradient(-45deg, var(--color-surface-2) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--color-surface-2) 75%), linear-gradient(-45deg, transparent 75%, var(--color-surface-2) 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0'
}

function Side({
  label,
  tone,
  info
}: {
  label: string
  tone: 'add' | 'remove'
  info: ImageInfo
}): React.JSX.Element {
  const { t } = useTranslation()
  const dims = info.width && info.height ? `${info.width}×${info.height}` : null
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <span
        className={`text-[11px] font-medium uppercase tracking-wide ${
          tone === 'add' ? 'text-diff-add' : 'text-diff-remove'
        }`}
      >
        {label}
      </span>
      <div
        className="flex max-h-72 w-full items-center justify-center overflow-hidden rounded-[var(--radius-card)] border border-border p-2"
        style={CHECKER}
      >
        {info.dataUrl ? (
          <img
            src={info.dataUrl}
            alt={label}
            className="max-h-64 max-w-full object-contain"
            style={{ imageRendering: 'auto' }}
          />
        ) : (
          <span className="p-6 text-[11px] italic text-fg-subtle">{t('diff.imageTooLarge')}</span>
        )}
      </div>
      <span className="text-[11px] text-fg-subtle">
        {dims ? `${dims} · ` : ''}
        {humanBytes(info.bytes)}
      </span>
    </div>
  )
}

/**
 * Visual diff for an image file: shows the before/after versions side by side
 * (or a single side for an add/delete) with dimensions and size, instead of the
 * plain "binary file" placeholder.
 */
export function ImageDiff({
  repoPath,
  source,
  file
}: {
  repoPath: string
  source: DiffSource
  file: DiffFile
}): React.JSX.Element {
  const { t } = useTranslation()
  const { data, isLoading, error } = useImageVersions(repoPath, source, file.path, file.oldPath)

  if (isLoading) return <p className="px-3 py-2 text-xs text-fg-subtle">{t('diff.loading')}</p>
  if (error) return <p className="px-3 py-2 text-xs text-danger">{(error as Error).message}</p>

  const before = data?.before ?? null
  const after = data?.after ?? null
  if (!before && !after) {
    return <p className="px-3 py-2 text-xs italic text-fg-subtle">{t('diff.binary')}</p>
  }

  // Size delta when both sides exist, so a re-export's weight change is visible.
  const delta =
    before && after ? after.bytes - before.bytes : null

  return (
    <div className="px-3 py-3">
      <div className="flex items-start gap-3">
        {before && <Side label={t('diff.before')} tone="remove" info={before} />}
        {after && <Side label={t('diff.after')} tone="add" info={after} />}
      </div>
      {delta !== null && delta !== 0 && (
        <p className="mt-2 text-center text-[11px] text-fg-subtle">
          {delta > 0 ? '+' : '−'}
          {humanBytes(Math.abs(delta))}
        </p>
      )}
    </div>
  )
}
