/**
 * Parsing of in-tree merge-conflict markers into structured segments.
 *
 * Git writes conflicts into the working file as:
 *
 *   <<<<<<< ours
 *   ...our lines...
 *   ||||||| base        (only with merge.conflictStyle=diff3)
 *   ...base lines...
 *   =======
 *   ...their lines...
 *   >>>>>>> theirs
 *
 * We turn that back into ordered segments (context vs. conflict) so the UI can
 * present each side and let the user choose, then reassemble a resolved file
 * with no markers. We never auto-resolve (CLAUDE.md §3) — this only structures
 * the data; the user picks.
 */

import type { ConflictFile, ConflictSegment } from '@shared/types'

const OURS = '<<<<<<<'
const BASE = '|||||||'
const SEP = '======='
const THEIRS = '>>>>>>>'

type State = 'context' | 'ours' | 'base' | 'theirs'

export function parseConflictText(path: string, text: string): ConflictFile {
  // Splitting on "\n" keeps a trailing "" element for files that end in a
  // newline, so a later join("\n") reproduces the original line endings exactly.
  const lines = text.split('\n')

  const segments: ConflictSegment[] = []
  let conflicts = 0
  let state: State = 'context'
  let context: string[] = []
  let ours: string[] = []
  let base: string[] = []
  let theirs: string[] = []
  let hasBase = false

  const flushContext = (): void => {
    if (context.length > 0) {
      segments.push({ type: 'context', lines: context })
      context = []
    }
  }

  for (const line of lines) {
    switch (state) {
      case 'context':
        if (line.startsWith(OURS)) {
          flushContext()
          ours = []
          base = []
          theirs = []
          hasBase = false
          state = 'ours'
        } else {
          context.push(line)
        }
        break
      case 'ours':
        if (line.startsWith(BASE)) {
          hasBase = true
          state = 'base'
        } else if (line.startsWith(SEP)) {
          state = 'theirs'
        } else {
          ours.push(line)
        }
        break
      case 'base':
        if (line.startsWith(SEP)) state = 'theirs'
        else base.push(line)
        break
      case 'theirs':
        if (line.startsWith(THEIRS)) {
          segments.push({ type: 'conflict', ours, base: hasBase ? base : null, theirs })
          conflicts++
          state = 'context'
        } else {
          theirs.push(line)
        }
        break
    }
  }

  // A well-formed conflicted file always closes its markers; if it didn't (the
  // file was hand-edited mid-parse), keep whatever context we have rather than
  // dropping lines.
  flushContext()

  return { path, segments, conflicts }
}
