/**
 * Shared domain types for Cyrex.
 *
 * These types describe the data that crosses the main <-> renderer boundary.
 * They must stay free of any Node/Electron or DOM specifics so both sides can
 * import them. No secrets ever appear in these shapes (see CLAUDE.md §4).
 */

export interface RepoRef {
  /** Absolute path to the repository working directory. */
  path: string
  /** Display name (basename of the path). */
  name: string
}

export type FileStatusCode =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'ignored'
  | 'conflicted'
  | 'unknown'

export interface FileStatus {
  path: string
  /** Original path for renames/copies. */
  origPath?: string
  /** Status of the change staged in the index. */
  index: FileStatusCode
  /** Status of the change in the working tree. */
  workingTree: FileStatusCode
  staged: boolean
}

export interface RepoStatus {
  /** Current branch name, or null when in detached HEAD. */
  branch: string | null
  /** Short HEAD sha, when resolvable. */
  head: string | null
  upstream: string | null
  ahead: number
  behind: number
  staged: FileStatus[]
  unstaged: FileStatus[]
  untracked: FileStatus[]
  conflicted: FileStatus[]
  /** True when there are no changes at all. */
  clean: boolean
}

export interface CommitAuthor {
  name: string
  email: string
  /** ISO-8601 timestamp. */
  date: string
}

export interface Commit {
  sha: string
  shortSha: string
  parents: string[]
  summary: string
  body: string
  author: CommitAuthor
  committer: CommitAuthor
  /** Ref names pointing at this commit (branches, tags, HEAD). */
  refs: string[]
}

export type BranchKind = 'local' | 'remote'

export interface Branch {
  name: string
  kind: BranchKind
  /** True for the currently checked-out local branch. */
  current: boolean
  upstream: string | null
  ahead: number
  behind: number
  targetSha: string
}

export interface Tag {
  name: string
  targetSha: string
  annotated: boolean
}

export interface LogOptions {
  /** Max commits to return (pagination). */
  limit?: number
  /** Skip N commits from the start (pagination). */
  skip?: number
  /** Restrict to a single ref; defaults to all refs (--all). */
  ref?: string
}

// --- diffs ------------------------------------------------------------------

export type DiffLineKind = 'context' | 'add' | 'remove'

export interface DiffLine {
  kind: DiffLineKind
  /** Line content without the leading +/-/space marker. */
  content: string
  /** 1-based line number on the old side (undefined for added lines). */
  oldNumber?: number
  /** 1-based line number on the new side (undefined for removed lines). */
  newNumber?: number
}

export interface DiffHunk {
  /** The raw @@ ... @@ header. */
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

export interface DiffFile {
  path: string
  /** Original path for renames/copies. */
  oldPath?: string
  status: FileStatusCode
  binary: boolean
  additions: number
  deletions: number
  hunks: DiffHunk[]
}

export interface CommitDiff {
  sha: string
  files: DiffFile[]
}

/**
 * Standard envelope for every engine result so the renderer can render real
 * error states instead of silently faking success (CLAUDE.md core principle:
 * Git-truthful, never fake state).
 */
export type EngineResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }
