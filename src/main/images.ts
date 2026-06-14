/**
 * Image-diff support: assembles the before/after versions of an image file into
 * inline `data:` URLs (with dimensions and byte size) for the renderer. Blob
 * bytes come from the Git engine (`showBytes`) or the working tree; pixel
 * dimensions are read with Electron's `nativeImage`. The renderer never touches
 * the filesystem or Git directly (CLAUDE.md §5).
 */

import { nativeImage } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { DiffSource, ImageInfo, ImageVersions } from '@shared/types'
import { showBytes } from './git/engine'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif'
}

/** Cap inlined images so a huge asset can't bloat an IPC payload. */
const MAX_INLINE = 12 * 1024 * 1024

/** True when a path has a previewable image extension. */
export function isImagePath(path: string): boolean {
  return Object.prototype.hasOwnProperty.call(MIME, extname(path).toLowerCase())
}

/** Build an ImageInfo from raw bytes, or null when the side is absent. */
function toInfo(buf: Buffer | null, path: string): ImageInfo | null {
  if (!buf) return null
  const mime = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'

  let width: number | null = null
  let height: number | null = null
  // SVG is vector — nativeImage can't size it; other formats decode for dims.
  if (mime !== 'image/svg+xml') {
    try {
      const size = nativeImage.createFromBuffer(buf).getSize()
      if (size.width > 0 && size.height > 0) {
        width = size.width
        height = size.height
      }
    } catch {
      /* undecodable on this platform — show without dimensions */
    }
  }

  const dataUrl = buf.length <= MAX_INLINE ? `data:${mime};base64,${buf.toString('base64')}` : null
  return { dataUrl, bytes: buf.length, width, height }
}

async function worktreeBytes(repoPath: string, path: string): Promise<Buffer | null> {
  try {
    return await readFile(join(repoPath, path))
  } catch {
    return null
  }
}

/**
 * Load the before/after image versions for a file given the diff it belongs to.
 * Missing sides (added/deleted, or a non-image at one revision) come back null.
 */
export async function imageVersions(
  repoPath: string,
  req: { path: string; oldPath?: string; source: DiffSource }
): Promise<ImageVersions> {
  const { path, oldPath, source } = req
  const old = oldPath ?? path

  // beforeBuf stays null for untracked files; afterBuf is set on every branch.
  let beforeBuf: Buffer | null = null
  let afterBuf: Buffer | null

  if (source.kind === 'commit') {
    afterBuf = await showBytes(repoPath, `${source.sha}:${path}`)
    beforeBuf = await showBytes(repoPath, `${source.sha}^:${old}`)
  } else if (source.untracked) {
    afterBuf = await worktreeBytes(repoPath, path)
  } else if (source.staged) {
    beforeBuf = await showBytes(repoPath, `HEAD:${old}`)
    afterBuf = await showBytes(repoPath, `:${path}`)
  } else {
    beforeBuf = await showBytes(repoPath, `:${old}`)
    afterBuf = await worktreeBytes(repoPath, path)
  }

  return { before: toInfo(beforeBuf, old), after: toInfo(afterBuf, path) }
}
