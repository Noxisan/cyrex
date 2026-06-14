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

/** A multi-step Git operation currently in progress in the working tree. */
export type RepoOperation = 'merge' | 'cherry-pick' | 'revert' | 'rebase' | null

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
  /** A merge/cherry-pick/revert/rebase mid-flight (e.g. awaiting conflict fix). */
  operation: RepoOperation
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

export interface Stash {
  /** Position in the stash stack (0 = most recent), i.e. stash@{index}. */
  index: number
  sha: string
  /** ISO-8601 timestamp. */
  date: string
  /** The stash subject, e.g. "WIP on main: 1a2b3c message". */
  message: string
}

/** A linked working tree (`git worktree`). */
export interface Worktree {
  /** Absolute path of the worktree's root. */
  path: string
  /** Checked-out commit sha, or null for a bare entry. */
  head: string | null
  /** Short branch name, or null when detached/bare. */
  branch: string | null
  bare: boolean
  detached: boolean
  locked: boolean
  /** Git considers this worktree removable (its path is gone). */
  prunable: boolean
  /** The repository's primary working tree (cannot be removed). */
  isMain: boolean
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

// --- conflicts --------------------------------------------------------------

/** One conflicting region of a file, with each side's lines (no markers). */
export interface ConflictHunk {
  /** "our" side (current branch / HEAD). */
  ours: string[]
  /** Common ancestor lines, when the file was merged with diff3 markers. */
  base: string[] | null
  /** "their" side (the branch/commit being merged or applied). */
  theirs: string[]
}

/**
 * A run of a conflicted file: either unconflicted context lines, or a conflict
 * hunk the user must resolve. Concatenating the chosen content of every segment
 * yields the resolved file.
 */
export type ConflictSegment =
  | { type: 'context'; lines: string[] }
  | ({ type: 'conflict' } & ConflictHunk)

export interface ConflictFile {
  path: string
  segments: ConflictSegment[]
  /** Number of conflict hunks (0 means the markers were already resolved). */
  conflicts: number
}

/** One entry in HEAD's reflog — a recoverable point in the local history. */
export interface ReflogEntry {
  /** Position in the reflog (0 = most recent), i.e. HEAD@{index}. */
  index: number
  /** The reflog selector, e.g. "HEAD@{0}". */
  selector: string
  sha: string
  shortSha: string
  /** The action verb, e.g. "commit", "reset", "checkout", "merge", "rebase". */
  action: string
  /** The remainder of the reflog subject after the action, e.g. "moving to HEAD~1". */
  message: string
  /** ISO-8601 timestamp of the entry's commit. */
  date: string
  /** Author/actor name of the underlying commit. */
  author: string
}

// --- embedded terminal ------------------------------------------------------

/** A shell command-runner session, scoped to a starting directory. */
export interface TerminalSession {
  id: string
  cwd: string
}

/** A chunk of output streamed from a running command. */
export interface TerminalData {
  id: string
  chunk: string
}

/** Sent when a command finishes; carries the session's (possibly updated) cwd. */
export interface TerminalExit {
  id: string
  code: number
  cwd: string
}

/** Context the commit box needs for amend and signing. */
export interface CommitContext {
  /** Whether HEAD exists (false on an unborn branch — nothing to amend). */
  hasHead: boolean
  /** Full message of HEAD, for pre-filling an amend. */
  headMessage: string
  /** True when a signing key / gpgsign is configured (so signing can work). */
  signingConfigured: boolean
  /** True when the user's config signs every commit by default. */
  signByDefault: boolean
}

// --- interactive rebase -----------------------------------------------------

/** What to do with a commit during an interactive rebase. */
export type RebaseAction = 'pick' | 'reword' | 'squash' | 'fixup' | 'edit' | 'drop'

/** One line of a planned interactive-rebase todo. */
export interface RebaseTodoItem {
  sha: string
  action: RebaseAction
  /** New commit message — only meaningful (and required) for `reword`. */
  message?: string
}

/** Outcome of starting an interactive rebase. */
export interface RebaseResult {
  /** True when the rebase ran to completion without stopping. */
  completed: boolean
  /**
   * True when the rebase paused mid-flight (an `edit` stop, or a conflict) and
   * is now in progress — the operation banner takes over with continue/abort.
   */
  stopped: boolean
}

export interface BlameLine {
  /** 1-based line number in the final file. */
  line: number
  sha: string
  shortSha: string
  author: string
  /** ISO-8601 timestamp of the commit that last touched this line. */
  date: string
  summary: string
  /** The line's text content. */
  content: string
}

/**
 * Standard envelope for every engine result so the renderer can render real
 * error states instead of silently faking success (CLAUDE.md core principle:
 * Git-truthful, never fake state).
 */
export type EngineResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

// --- Remote hosting (GitHub / GitLab / Bitbucket) ---------------------------
//
// These cross the main<->renderer boundary and therefore carry NO secrets
// (CLAUDE.md §4). Access tokens live only in the main process and the OS
// keychain; the renderer sees account/repo metadata and the device user code.

export type HostingProviderId = 'github' | 'gitlab' | 'bitbucket'

/** A connected hosting account — metadata only, never a token. */
export interface HostingAccount {
  /** Stable local id: `${provider}:${login}`. */
  id: string
  provider: HostingProviderId
  login: string
  name: string | null
  avatarUrl: string | null
}

/** A repository on a hosting provider (browse/clone candidate). */
export interface RemoteRepo {
  id: string
  /** "owner/name". */
  fullName: string
  name: string
  owner: string
  private: boolean
  description: string | null
  /** HTTPS clone URL (no embedded credentials). */
  cloneUrl: string
  htmlUrl: string
  defaultBranch: string | null
  updatedAt: string | null
}

export interface CreateRepoInput {
  name: string
  description?: string
  private: boolean
}

/** Returned when an OAuth device-flow login starts; the user code is shown. */
export interface DeviceLoginStart {
  /** Opaque handle the renderer passes to poll; the device_code stays in main. */
  handle: string
  userCode: string
  verificationUri: string
  intervalSec: number
}

/** One poll of a device-flow login. On `authorized` the account is saved. */
export type DeviceLoginStatus =
  | { status: 'pending' }
  | { status: 'slowDown' }
  | { status: 'authorized'; account: HostingAccount }
  | { status: 'expired' }
  | { status: 'denied' }
