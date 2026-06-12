/**
 * Unified-diff parser. Turns `git`'s textual patch output into the structured
 * DiffFile[] the renderer draws. Kept pure (no spawning here) so it is easy to
 * reason about and test; engine.ts feeds it raw `git show/diff` output.
 */

import type { DiffFile, DiffHunk, DiffLine, FileStatusCode } from '@shared/types'

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

/** Strip a leading a/ or b/ prefix git adds to diff paths. */
function stripPrefix(p: string): string {
  if (p === '/dev/null') return p
  return p.replace(/^[ab]\//, '')
}

/**
 * Parse a (possibly multi-file) unified diff. Handles added/deleted/renamed/
 * modified files and binary files. Anything before the first `diff --git` is
 * ignored (e.g. a commit header).
 */
export function parseUnifiedDiff(patch: string): DiffFile[] {
  const files: DiffFile[] = []
  const lines = patch.split('\n')
  let file: DiffFile | null = null
  let hunk: DiffHunk | null = null
  let oldNo = 0
  let newNo = 0

  const pushFile = (): void => {
    if (file) {
      if (hunk) file.hunks.push(hunk)
      files.push(file)
    }
    hunk = null
  }

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      pushFile()
      // diff --git a/<old> b/<new>
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/)
      const path = m ? m[2] : ''
      file = {
        path,
        status: 'modified',
        binary: false,
        additions: 0,
        deletions: 0,
        hunks: []
      }
      continue
    }
    if (!file) continue

    if (line.startsWith('new file mode')) {
      file.status = 'added'
      continue
    }
    if (line.startsWith('deleted file mode')) {
      file.status = 'deleted'
      continue
    }
    if (line.startsWith('rename from ')) {
      file.status = 'renamed'
      file.oldPath = line.slice('rename from '.length)
      continue
    }
    if (line.startsWith('rename to ')) {
      file.status = 'renamed'
      file.path = line.slice('rename to '.length)
      continue
    }
    if (line.startsWith('copy from ')) {
      file.status = 'copied'
      file.oldPath = line.slice('copy from '.length)
      continue
    }
    if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) {
      file.binary = true
      continue
    }
    if (line.startsWith('--- ')) {
      const p = stripPrefix(line.slice(4))
      if (p !== '/dev/null') file.oldPath = file.oldPath ?? p
      continue
    }
    if (line.startsWith('+++ ')) {
      const p = stripPrefix(line.slice(4))
      if (p !== '/dev/null') file.path = p
      continue
    }

    const hm = line.match(HUNK_RE)
    if (hm) {
      if (hunk) file.hunks.push(hunk)
      const oldStart = Number(hm[1])
      const oldLines = hm[2] === undefined ? 1 : Number(hm[2])
      const newStart = Number(hm[3])
      const newLines = hm[4] === undefined ? 1 : Number(hm[4])
      hunk = { header: line, oldStart, oldLines, newStart, newLines, lines: [] }
      oldNo = oldStart
      newNo = newStart
      continue
    }

    if (!hunk) continue
    // "\ No newline at end of file" is metadata, not a content line.
    if (line.startsWith('\\')) continue

    const marker = line[0]
    const content = line.slice(1)
    let dl: DiffLine
    if (marker === '+') {
      dl = { kind: 'add', content, newNumber: newNo++ }
      file.additions++
    } else if (marker === '-') {
      dl = { kind: 'remove', content, oldNumber: oldNo++ }
      file.deletions++
    } else {
      // Context line (leading space) or an empty trailing line.
      dl = { kind: 'context', content, oldNumber: oldNo++, newNumber: newNo++ }
    }
    hunk.lines.push(dl)
  }

  pushFile()
  return files
}

/** Map a diff-tree status letter (A/M/D/R/C/T) to our FileStatusCode. */
export function statusFromLetter(letter: string): FileStatusCode {
  switch (letter[0]) {
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    case 'T':
    case 'M':
      return 'modified'
    default:
      return 'unknown'
  }
}
