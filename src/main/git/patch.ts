/**
 * Builds minimal, apply-able patches for partial (hunk- or line-level) staging.
 *
 * Works on the RAW `git diff` text for a single file rather than re-serializing
 * our parsed model, so byte-exact details (mode lines, "\ No newline at end of
 * file", etc.) survive. The resulting patch is fed to `git apply --cached`
 * (optionally --reverse) with --recount, so git re-derives hunk line counts and
 * we only have to get the line *content* right.
 */

interface RawEntry {
  /** Leading marker: ' ' context, '+' add, '-' remove. */
  marker: ' ' | '+' | '-'
  /** Full raw line including the marker. */
  raw: string
  /** A following "\ No newline at end of file" line, if present. */
  noNewline?: string
}

interface RawHunk {
  header: string
  oldStart: number
  newStart: number
  entries: RawEntry[]
}

interface RawFileDiff {
  /** Header lines: `diff --git`, mode/index lines, `--- a/..`, `+++ b/..`. */
  header: string[]
  hunks: RawHunk[]
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/** Parse the raw diff of a single file into header + hunks with raw entries. */
export function parseRawFileDiff(rawDiff: string): RawFileDiff {
  const lines = rawDiff.split('\n')
  const header: string[] = []
  const hunks: RawHunk[] = []
  let current: RawHunk | null = null
  let i = 0

  // Header: everything before the first @@.
  for (; i < lines.length; i++) {
    if (lines[i].startsWith('@@')) break
    if (lines[i] === '' && i === lines.length - 1) continue
    header.push(lines[i])
  }

  for (; i < lines.length; i++) {
    const line = lines[i]
    const hm = line.match(HUNK_RE)
    if (hm) {
      current = { header: line, oldStart: Number(hm[1]), newStart: Number(hm[2]), entries: [] }
      hunks.push(current)
      continue
    }
    if (!current) continue
    if (line.startsWith('\\')) {
      const last = current.entries[current.entries.length - 1]
      if (last) last.noNewline = line
      continue
    }
    if (line === '' && i === lines.length - 1) continue
    const marker = line[0]
    if (marker === ' ' || marker === '+' || marker === '-') {
      current.entries.push({ marker, raw: line })
    }
  }

  return { header, hunks }
}

/**
 * Build a patch for one hunk. When `selectedLines` is given, only those entry
 * indices (into the hunk's entries / our parsed hunk.lines, which align) are
 * included: unselected additions are dropped and unselected removals become
 * context. When omitted, the whole hunk is emitted verbatim.
 */
export function buildPatch(
  rawDiff: string,
  hunkIndex: number,
  selectedLines?: number[]
): string {
  const parsed = parseRawFileDiff(rawDiff)
  const hunk = parsed.hunks[hunkIndex]
  if (!hunk) throw new Error('Hunk no longer exists; refresh and try again.')

  const sel = selectedLines ? new Set(selectedLines) : null
  const body: string[] = []
  let oldCount = 0
  let newCount = 0
  let kept = 0

  hunk.entries.forEach((entry, idx) => {
    const include = sel ? sel.has(idx) : true
    if (entry.marker === ' ') {
      body.push(entry.raw)
      if (entry.noNewline) body.push(entry.noNewline)
      oldCount++
      newCount++
    } else if (entry.marker === '+') {
      if (include) {
        body.push(entry.raw)
        if (entry.noNewline) body.push(entry.noNewline)
        newCount++
        kept++
      }
      // unselected addition: dropped entirely
    } else {
      // removal
      if (include) {
        body.push(entry.raw)
        if (entry.noNewline) body.push(entry.noNewline)
        oldCount++
        kept++
      } else {
        // keep as context so the line survives in the result
        body.push(' ' + entry.raw.slice(1))
        if (entry.noNewline) body.push(entry.noNewline)
        oldCount++
        newCount++
      }
    }
  })

  if (sel && kept === 0) throw new Error('No changes selected.')

  const hunkHeader = `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`
  return [...parsed.header, hunkHeader, ...body].join('\n') + '\n'
}
