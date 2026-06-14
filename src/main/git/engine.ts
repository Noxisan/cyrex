/**
 * The Cyrex Git engine — the ONLY place Git is accessed (CLAUDE.md §3, §5).
 *
 * Public, command-equivalent operations the renderer can call (via IPC). Today
 * this is implemented on the system `git` CLI (cli.ts). The function surface is
 * deliberately backend-agnostic so a nodegit (libgit2) implementation can be
 * dropped in behind the same signatures later without touching the renderer.
 */

import { basename, join, resolve } from 'node:path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type {
  BlameLine,
  Branch,
  Commit,
  CommitContext,
  CommitDiff,
  ConflictFile,
  DiffFile,
  FileStatus,
  FileStatusCode,
  LfsFile,
  LfsStatus,
  LogOptions,
  RebaseResult,
  RebaseTodoItem,
  ReflogEntry,
  RepoOperation,
  RepoRef,
  RepoStatus,
  Stash,
  Submodule,
  Tag,
  Worktree
} from '@shared/types'
import { gitVersion, isGitRepo, runGit, scrubSecrets } from './cli'
import { parseUnifiedDiff } from './diff'
import { parseConflictText } from './conflict'
import { buildPatch } from './patch'

const US = '\x1f' // unit separator — between fields
const RS = '\x1e' // record separator — between records

export async function getEngineInfo(): Promise<{ backend: 'cli'; version: string }> {
  return { backend: 'cli', version: await gitVersion() }
}

/** Validate that a path is a real git work tree and return a RepoRef. */
export async function openRepo(path: string): Promise<RepoRef> {
  if (!(await isGitRepo(path))) {
    throw new Error(`Not a Git repository: ${path}`)
  }
  // Resolve to the work-tree root so all later commands share one cwd.
  const { stdout } = await runGit(['rev-parse', '--show-toplevel'], { cwd: path })
  const root = stdout.trim() || path
  return { path: root, name: basename(root) }
}

// --- status ---------------------------------------------------------------

function mapCode(c: string): FileStatusCode {
  switch (c) {
    case 'A':
      return 'added'
    case 'M':
    case 'T': // typechange — surface as modified for now
      return 'modified'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    case 'U':
      return 'conflicted'
    case '.':
    case ' ':
      return 'unknown'
    default:
      return 'unknown'
  }
}

/** Detect an in-progress merge/cherry-pick/revert/rebase from the git dir. */
async function detectOperation(repoPath: string): Promise<RepoOperation> {
  const { stdout } = await runGit(['rev-parse', '--git-dir'], { cwd: repoPath })
  const gitDir = resolve(repoPath, stdout.trim())
  if (existsSync(join(gitDir, 'MERGE_HEAD'))) return 'merge'
  if (existsSync(join(gitDir, 'CHERRY_PICK_HEAD'))) return 'cherry-pick'
  if (existsSync(join(gitDir, 'REVERT_HEAD'))) return 'revert'
  if (existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply')))
    return 'rebase'
  return null
}

export async function status(repoPath: string): Promise<RepoStatus> {
  const { stdout } = await runGit(
    ['status', '--porcelain=v2', '--branch', '--untracked-files=all', '-z'],
    { cwd: repoPath }
  )

  const result: RepoStatus = {
    branch: null,
    head: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    operation: await detectOperation(repoPath),
    clean: true
  }

  // Records are NUL-separated. Rename/copy records (type '2') consume the next
  // record as their original path, so we iterate with an index.
  const records = stdout.split('\0')
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]
    if (!rec) continue

    if (rec.startsWith('# ')) {
      const [, key, ...rest] = rec.split(' ')
      const val = rest.join(' ')
      if (key === 'branch.head') result.branch = val === '(detached)' ? null : val
      else if (key === 'branch.oid') result.head = val.slice(0, 7)
      else if (key === 'branch.upstream') result.upstream = val
      else if (key === 'branch.ab') {
        const m = val.match(/\+(\d+)\s+-(\d+)/)
        if (m) {
          result.ahead = Number(m[1])
          result.behind = Number(m[2])
        }
      }
      continue
    }

    const type = rec[0]
    if (type === '1' || type === '2') {
      const parts = rec.split(' ')
      const xy = parts[1] // e.g. "M." or ".M"
      const indexCode = mapCode(xy[0])
      const wtCode = mapCode(xy[1])
      let path: string
      let origPath: string | undefined
      if (type === '2') {
        // path is the last space-delimited field of this record; the original
        // path is the FOLLOWING NUL-separated record.
        path = parts.slice(9).join(' ')
        origPath = records[++i]
      } else {
        path = parts.slice(8).join(' ')
      }
      const file: FileStatus = {
        path,
        origPath,
        index: indexCode,
        workingTree: wtCode,
        staged: xy[0] !== '.'
      }
      if (xy[0] !== '.') result.staged.push(file)
      if (xy[1] !== '.') result.unstaged.push({ ...file, staged: false })
    } else if (type === 'u') {
      const parts = rec.split(' ')
      const path = parts.slice(10).join(' ')
      result.conflicted.push({
        path,
        index: 'conflicted',
        workingTree: 'conflicted',
        staged: false
      })
    } else if (type === '?') {
      result.untracked.push({
        path: rec.slice(2),
        index: 'untracked',
        workingTree: 'untracked',
        staged: false
      })
    }
    // type '!' (ignored) is omitted because --untracked-files=all does not emit
    // ignored entries unless explicitly requested.
  }

  result.clean =
    result.staged.length === 0 &&
    result.unstaged.length === 0 &&
    result.untracked.length === 0 &&
    result.conflicted.length === 0

  return result
}

// --- log -------------------------------------------------------------------

const LOG_FORMAT =
  ['%H', '%h', '%P', '%an', '%ae', '%aI', '%cn', '%ce', '%cI', '%D', '%s', '%b'].join(US) + RS

/** Parse the RS/US-delimited output produced by LOG_FORMAT. */
function parseCommits(stdout: string): Commit[] {
  const commits: Commit[] = []
  for (const raw of stdout.split(RS)) {
    const rec = raw.replace(/^\n/, '')
    if (!rec.trim()) continue
    const f = rec.split(US)
    if (f.length < 12) continue
    const refs = f[9]
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean)
    commits.push({
      sha: f[0],
      shortSha: f[1],
      parents: f[2] ? f[2].split(' ').filter(Boolean) : [],
      author: { name: f[3], email: f[4], date: f[5] },
      committer: { name: f[6], email: f[7], date: f[8] },
      refs,
      summary: f[10],
      body: f[11].trimEnd()
    })
  }
  return commits
}

export async function log(repoPath: string, options: LogOptions = {}): Promise<Commit[]> {
  const { limit = 200, skip = 0, ref } = options
  // --topo-order keeps branch lines contiguous so the lane graph reads cleanly
  // (default date order interleaves parallel branches).
  const args = ['log', '--topo-order', `--format=${LOG_FORMAT}`, `--max-count=${limit}`]
  if (skip > 0) args.push(`--skip=${skip}`)
  args.push(ref ?? '--all')
  const { stdout } = await runGit(args, { cwd: repoPath })
  return parseCommits(stdout)
}

/**
 * Search commits across all refs by message, author, or sha prefix. Runs a
 * literal (-F), case-insensitive log for each facet and unions the results,
 * newest first — search results are a flat list, not a lane graph.
 */
export async function searchCommits(
  repoPath: string,
  query: string,
  limit = 200
): Promise<Commit[]> {
  const q = query.trim()
  if (!q) return []

  const base = [
    'log',
    '--all',
    '-i',
    '--fixed-strings',
    `--format=${LOG_FORMAT}`,
    `--max-count=${limit}`
  ]
  const byMessage = parseCommits((await runGit([...base, `--grep=${q}`], { cwd: repoPath })).stdout)
  const byAuthor = parseCommits(
    (await runGit([...base, `--author=${q}`], { cwd: repoPath })).stdout
  )

  const byId = new Map<string, Commit>()
  for (const c of byMessage) byId.set(c.sha, c)
  for (const c of byAuthor) byId.set(c.sha, c)

  // Direct sha / ref lookup when the query looks like an object id.
  if (/^[0-9a-f]{4,40}$/i.test(q)) {
    const res = await runGit(['log', '-1', `--format=${LOG_FORMAT}`, q], {
      cwd: repoPath,
      throwOnError: false
    })
    if (res.code === 0) for (const c of parseCommits(res.stdout)) byId.set(c.sha, c)
  }

  return [...byId.values()]
    .sort((a, b) => b.committer.date.localeCompare(a.committer.date))
    .slice(0, limit)
}

/** History of a single file, following renames. */
export async function fileHistory(
  repoPath: string,
  file: string,
  options: LogOptions = {}
): Promise<Commit[]> {
  const { limit = 200, skip = 0 } = options
  const args = ['log', '--follow', `--format=${LOG_FORMAT}`, `--max-count=${limit}`]
  if (skip > 0) args.push(`--skip=${skip}`)
  args.push('--', file)
  const { stdout } = await runGit(args, { cwd: repoPath })
  return parseCommits(stdout)
}

// --- reflog & undo ----------------------------------------------------------
//
// The reflog is the local safety net: every move of HEAD (commit, reset,
// checkout, merge, rebase, pull) is recorded, so a "lost" commit is almost
// always still reachable. Surfacing it makes recovery from mistakes easy and
// visible (CLAUDE.md §8: undo / reflog surface).

const REFLOG_FORMAT = ['%H', '%h', '%gd', '%gs', '%cI', '%an'].join(US) + RS

/** Read HEAD's reflog — recoverable points in the local history, newest first. */
export async function reflog(repoPath: string, limit = 200): Promise<ReflogEntry[]> {
  const { stdout } = await runGit(
    ['reflog', '--no-abbrev', `--format=${REFLOG_FORMAT}`, `--max-count=${limit}`],
    { cwd: repoPath }
  )

  const entries: ReflogEntry[] = []
  for (const raw of stdout.split(RS)) {
    const rec = raw.replace(/^\n/, '')
    if (!rec.trim()) continue
    const f = rec.split(US)
    if (f.length < 6) continue
    const selector = f[2]
    const idx = selector.match(/@\{(\d+)\}/)
    // The reflog subject is "<action>: <message>" (e.g. "reset: moving to HEAD~1");
    // some entries have no colon (e.g. "initial pull"). Split on the first ": ".
    const subject = f[3]
    const sep = subject.indexOf(': ')
    const action = sep === -1 ? subject : subject.slice(0, sep)
    const message = sep === -1 ? '' : subject.slice(sep + 2)
    entries.push({
      index: idx ? Number(idx[1]) : entries.length,
      selector,
      sha: f[0],
      shortSha: f[1],
      action,
      message,
      date: f[4],
      author: f[5]
    })
  }
  return entries
}

export type ResetMode = 'soft' | 'mixed' | 'hard'

/**
 * Move HEAD to a commit. `soft` keeps the index and working tree; `mixed`
 * (git default) resets the index but keeps working changes; `hard` is
 * DESTRUCTIVE — it discards working-tree and index changes, so callers must
 * confirm with the user first (CLAUDE.md §3 safety rules). The target sha is
 * resolved from the reflog, which itself remains as a further undo path.
 */
export async function resetTo(repoPath: string, sha: string, mode: ResetMode): Promise<void> {
  await runGit(['reset', `--${mode}`, sha], { cwd: repoPath })
}

// --- blame -----------------------------------------------------------------

/**
 * Line-by-line authorship of a file. Parses `git blame --line-porcelain`, where
 * every line carries its full commit header (simplest to parse robustly).
 */
export async function blame(repoPath: string, file: string): Promise<BlameLine[]> {
  const { stdout } = await runGit(['blame', '--line-porcelain', '--', file], { cwd: repoPath })

  const lines: BlameLine[] = []
  let cur: Partial<BlameLine> & { sha?: string } = {}
  for (const line of stdout.split('\n')) {
    // Header line: "<40-hex> <origLine> <finalLine> [<group size>]"
    const head = line.match(/^([0-9a-f]{40}) \d+ (\d+)/)
    if (head) {
      cur = { sha: head[1], shortSha: head[1].slice(0, 7), line: Number(head[2]) }
      continue
    }
    if (line.startsWith('author ')) cur.author = line.slice(7)
    else if (line.startsWith('author-time ')) {
      cur.date = new Date(Number(line.slice(12)) * 1000).toISOString()
    } else if (line.startsWith('summary ')) cur.summary = line.slice(8)
    else if (line.startsWith('\t')) {
      // The content line (prefixed by a tab) ends the entry.
      lines.push({
        line: cur.line ?? lines.length + 1,
        sha: cur.sha ?? '',
        shortSha: cur.shortSha ?? '',
        author: cur.author ?? '',
        date: cur.date ?? '',
        summary: cur.summary ?? '',
        content: line.slice(1)
      })
    }
  }
  return lines
}

// --- branches & tags -------------------------------------------------------

function parseTrack(track: string): { ahead: number; behind: number } {
  const ahead = track.match(/ahead (\d+)/)
  const behind = track.match(/behind (\d+)/)
  return { ahead: ahead ? Number(ahead[1]) : 0, behind: behind ? Number(behind[1]) : 0 }
}

export async function branches(repoPath: string): Promise<Branch[]> {
  const fmt = ['%(refname)', '%(objectname)', '%(upstream:short)', '%(upstream:track)', '%(HEAD)'].join(US)
  const { stdout } = await runGit(
    ['for-each-ref', `--format=${fmt}`, 'refs/heads', 'refs/remotes'],
    { cwd: repoPath }
  )

  const list: Branch[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const [refname, sha, upstream, track, head] = line.split(US)
    const isRemote = refname.startsWith('refs/remotes/')
    const name = refname.replace(/^refs\/(heads|remotes)\//, '')
    // Skip the symbolic "origin/HEAD -> origin/main" pointer.
    if (isRemote && name.endsWith('/HEAD')) continue
    const { ahead, behind } = parseTrack(track ?? '')
    list.push({
      name,
      kind: isRemote ? 'remote' : 'local',
      current: head === '*',
      upstream: upstream || null,
      ahead,
      behind,
      targetSha: sha
    })
  }
  return list
}

// --- diff ------------------------------------------------------------------

/**
 * Structured diff for a single commit. Diffs against the FIRST parent (so merge
 * commits produce a readable two-way diff rather than git's combined format);
 * the root commit is shown in full. Rename detection (-M) is on.
 */
export async function commitDiff(repoPath: string, sha: string): Promise<CommitDiff> {
  // Resolve parents without trusting caller-supplied data.
  const { stdout: rev } = await runGit(['rev-list', '--parents', '-n', '1', sha], {
    cwd: repoPath
  })
  const parents = rev.trim().split(' ').slice(1)

  const common = ['--no-color', '--patch', '-U3', '-M', '--find-renames']
  let patch: string
  if (parents.length === 0) {
    // Root commit: show the whole thing as additions.
    const { stdout } = await runGit(['show', '--format=', ...common, '--root', sha], {
      cwd: repoPath
    })
    patch = stdout
  } else {
    // Diff first parent -> commit. Clean two-way diff for merges too.
    const { stdout } = await runGit(['diff', ...common, `${parents[0]}`, sha], {
      cwd: repoPath
    })
    patch = stdout
  }

  return { sha, files: parseUnifiedDiff(patch) }
}

// --- working tree: diff, staging, commit -----------------------------------

/** Synthesize an all-additions diff for an untracked file (git diff omits it). */
async function untrackedFileDiff(repoPath: string, file: string): Promise<DiffFile> {
  const buf = await readFile(join(repoPath, file))
  if (buf.includes(0)) {
    return { path: file, status: 'added', binary: true, additions: 0, deletions: 0, hunks: [] }
  }
  const text = buf.toString('utf8')
  const lines = text.length === 0 ? [] : text.replace(/\n$/, '').split('\n')
  const diffLines = lines.map((content, i) => ({
    kind: 'add' as const,
    content,
    newNumber: i + 1
  }))
  return {
    path: file,
    status: 'added',
    binary: false,
    additions: lines.length,
    deletions: 0,
    hunks:
      lines.length === 0
        ? []
        : [
            {
              header: `@@ -0,0 +1,${lines.length} @@`,
              oldStart: 0,
              oldLines: 0,
              newStart: 1,
              newLines: lines.length,
              lines: diffLines
            }
          ]
  }
}

export interface WorkingDiffOptions {
  file: string
  /** true = staged (index vs HEAD), false = unstaged (working tree vs index). */
  staged: boolean
  untracked: boolean
}

/** Diff for a single working-tree file, staged or unstaged. */
export async function workingDiff(
  repoPath: string,
  opts: WorkingDiffOptions
): Promise<CommitDiff> {
  if (opts.untracked && !opts.staged) {
    return { sha: 'WORKTREE', files: [await untrackedFileDiff(repoPath, opts.file)] }
  }
  const args = ['diff', '--no-color', '--patch', '-U3', '-M', '--find-renames']
  if (opts.staged) args.push('--cached')
  args.push('--', opts.file)
  const { stdout } = await runGit(args, { cwd: repoPath })
  return { sha: opts.staged ? 'INDEX' : 'WORKTREE', files: parseUnifiedDiff(stdout) }
}

/** Stage a file (handles modified, deleted, and untracked via `git add`). */
export async function stage(repoPath: string, file: string): Promise<void> {
  await runGit(['add', '--', file], { cwd: repoPath })
}

/** Unstage a file, returning it to the working tree unchanged. */
export async function unstage(repoPath: string, file: string): Promise<void> {
  await runGit(['restore', '--staged', '--', file], { cwd: repoPath })
}

/**
 * DESTRUCTIVE: discard a file's working-tree changes. Untracked files are
 * removed; tracked files are restored from the index. Callers must confirm with
 * the user first (CLAUDE.md §3 safety rules).
 */
export async function discard(repoPath: string, file: string, untracked: boolean): Promise<void> {
  if (untracked) {
    await runGit(['clean', '-f', '--', file], { cwd: repoPath })
  } else {
    await runGit(['restore', '--worktree', '--', file], { cwd: repoPath })
  }
}

export interface CommitResult {
  sha: string
}

export interface CommitOptions {
  /** Replace the previous commit (HEAD) instead of creating a new one. */
  amend?: boolean
  /** Sign the commit (GPG/SSH) per the user's git config. */
  sign?: boolean
}

/**
 * Create a commit from the staged index, or amend HEAD. Signing (`-S`) is
 * delegated to the user's configured key/agent — Cyrex never handles the key
 * material itself (CLAUDE.md §4). Returns the resulting HEAD sha.
 */
export async function commit(
  repoPath: string,
  message: string,
  opts: CommitOptions = {}
): Promise<CommitResult> {
  const trimmed = message.trim()
  if (trimmed.length === 0) throw new Error('Commit message must not be empty.')
  const args = ['commit']
  if (opts.amend) args.push('--amend')
  if (opts.sign) args.push('-S')
  args.push('-m', trimmed)
  await runGit(args, { cwd: repoPath })
  const { stdout } = await runGit(['rev-parse', 'HEAD'], { cwd: repoPath })
  return { sha: stdout.trim() }
}

/** Context the commit box needs: HEAD message (for amend) and signing config. */
export async function commitContext(repoPath: string): Promise<CommitContext> {
  const head = await runGit(['rev-parse', '--verify', '-q', 'HEAD'], {
    cwd: repoPath,
    throwOnError: false
  })
  const hasHead = head.code === 0

  let headMessage = ''
  if (hasHead) {
    const { stdout } = await runGit(['log', '-1', '--format=%B'], { cwd: repoPath })
    headMessage = stdout.replace(/\n+$/, '')
  }

  const cfg = async (key: string): Promise<string> =>
    (await runGit(['config', '--get', key], { cwd: repoPath, throwOnError: false })).stdout.trim()
  const signingKey = await cfg('user.signingkey')
  const gpgsign = await cfg('commit.gpgsign')

  return {
    hasHead,
    headMessage,
    signingConfigured: signingKey.length > 0 || gpgsign === 'true',
    signByDefault: gpgsign === 'true'
  }
}

export type PartialOp = 'stage' | 'unstage' | 'discard'

export interface PartialOptions {
  file: string
  /** Index of the hunk within the file's current diff. */
  hunkIndex: number
  /** Entry indices within the hunk to apply; omit for the whole hunk. */
  lines?: number[]
  op: PartialOp
}

async function fileDiffText(repoPath: string, file: string, staged: boolean): Promise<string> {
  const args = ['diff', '--no-color', '-U3', '-M', '--find-renames']
  if (staged) args.push('--cached')
  args.push('--', file)
  const { stdout } = await runGit(args, { cwd: repoPath })
  return stdout
}

/**
 * Apply a single hunk (or selected lines within it) to the index or working
 * tree. `stage` adds working changes to the index; `unstage` removes them from
 * the index; `discard` (DESTRUCTIVE) reverts them in the working tree. The
 * source diff is always re-fetched so we patch the authoritative current state.
 */
export async function applyPartial(repoPath: string, opts: PartialOptions): Promise<void> {
  const { file, hunkIndex, lines, op } = opts
  // unstage works from the staged (index vs HEAD) diff; the others from working.
  const raw = await fileDiffText(repoPath, file, op === 'unstage')
  if (!raw.trim()) throw new Error('Nothing to apply — the diff is empty (already applied?).')

  const patch = buildPatch(raw, hunkIndex, lines)
  const args = ['apply', '--recount', '--whitespace=nowarn']
  if (op === 'stage' || op === 'unstage') args.push('--cached')
  if (op === 'unstage' || op === 'discard') args.push('--reverse')
  await runGit(args, { cwd: repoPath, input: patch })
}

// --- branch operations -----------------------------------------------------

/** Switch the working tree to a branch, tag, or commit. */
export async function checkout(repoPath: string, ref: string): Promise<void> {
  await runGit(['checkout', ref], { cwd: repoPath })
}

/**
 * Check out a remote-tracking branch by creating a local branch that tracks it
 * (e.g. "origin/feature/x" -> local "feature/x"). Falls back to switching to an
 * existing local branch of the same name.
 */
export async function checkoutRemote(repoPath: string, remoteRef: string): Promise<void> {
  const local = remoteRef.replace(/^[^/]+\//, '')
  try {
    await runGit(['checkout', '-b', local, '--track', remoteRef], { cwd: repoPath })
  } catch (err) {
    // Local branch already exists — just switch to it (it likely already tracks).
    if (err instanceof Error && /already exists/i.test(err.message)) {
      await runGit(['checkout', local], { cwd: repoPath })
      return
    }
    throw err
  }
}

export interface CreateBranchOptions {
  startPoint?: string
  checkout?: boolean
}

export async function createBranch(
  repoPath: string,
  name: string,
  opts: CreateBranchOptions = {}
): Promise<void> {
  const start = opts.startPoint ? [opts.startPoint] : []
  if (opts.checkout) await runGit(['checkout', '-b', name, ...start], { cwd: repoPath })
  else await runGit(['branch', name, ...start], { cwd: repoPath })
}

export async function renameBranch(
  repoPath: string,
  oldName: string,
  newName: string
): Promise<void> {
  await runGit(['branch', '-m', oldName, newName], { cwd: repoPath })
}

/**
 * Delete a local branch. `-d` refuses to drop unmerged work; `force` uses `-D`
 * and is DESTRUCTIVE (unmerged commits become unreachable) — callers confirm.
 */
export async function deleteBranch(
  repoPath: string,
  name: string,
  force = false
): Promise<void> {
  await runGit(['branch', force ? '-D' : '-d', name], { cwd: repoPath })
}

// --- tags -------------------------------------------------------------------

/**
 * Create a tag at `ref` (default HEAD). A non-empty `message` makes it an
 * annotated tag (`git tag -a -m`); otherwise it is lightweight.
 */
export async function createTag(
  repoPath: string,
  name: string,
  ref?: string,
  message?: string
): Promise<void> {
  const args = ['tag']
  if (message && message.trim()) args.push('-a', '-m', message.trim())
  args.push(name)
  if (ref) args.push(ref)
  await runGit(args, { cwd: repoPath })
}

/** DESTRUCTIVE locally: delete a tag ref (a pushed tag remains on the remote). */
export async function deleteTag(repoPath: string, name: string): Promise<void> {
  await runGit(['tag', '-d', name], { cwd: repoPath })
}

/** Push a single tag to the default remote. */
export async function pushTag(repoPath: string, name: string): Promise<void> {
  const remote = await defaultRemote(repoPath)
  await runGit(['push', remote, `refs/tags/${name}`], {
    cwd: repoPath,
    timeoutMs: NETWORK_TIMEOUT
  })
}

// --- remotes: fetch / pull / push -------------------------------------------
//
// Network operations delegate credentials entirely to the user's system git
// (credential helper for HTTPS, ssh-agent/keys for SSH) — Cyrex never handles
// or stores secrets (CLAUDE.md §4). With GIT_TERMINAL_PROMPT=0 a missing
// credential fails fast with a clear error instead of hanging on a prompt.

const NETWORK_TIMEOUT = 120_000

/** Name of the remote to push to by default ("origin" if present). */
async function defaultRemote(repoPath: string): Promise<string> {
  const { stdout } = await runGit(['remote'], { cwd: repoPath })
  const remotes = stdout.split('\n').map((r) => r.trim()).filter(Boolean)
  if (remotes.length === 0) throw new Error('No remote is configured for this repository.')
  return remotes.includes('origin') ? 'origin' : remotes[0]
}

/** Fetch all remotes and prune deleted remote-tracking branches. */
export async function fetch(repoPath: string): Promise<void> {
  await runGit(['fetch', '--all', '--prune'], { cwd: repoPath, timeoutMs: NETWORK_TIMEOUT })
}

/** Pull the current branch from its upstream (merge per the user's git config). */
export async function pull(repoPath: string): Promise<void> {
  await runGit(['pull'], { cwd: repoPath, timeoutMs: NETWORK_TIMEOUT })
}

export interface PushOptions {
  /** Force with lease — refuses to clobber unseen upstream work. Destructive. */
  force?: boolean
}

/** Push the current branch, setting upstream on first push. */
export async function push(repoPath: string, opts: PushOptions = {}): Promise<void> {
  const branch = (
    await runGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], {
      cwd: repoPath,
      throwOnError: false
    })
  ).stdout.trim()
  if (!branch) throw new Error('Cannot push in a detached HEAD state.')

  const upstream = (
    await runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], {
      cwd: repoPath,
      throwOnError: false
    })
  ).stdout.trim()

  const args = ['push']
  if (opts.force) args.push('--force-with-lease')
  if (!upstream) {
    // First push: publish the branch and set its upstream.
    args.push('-u', await defaultRemote(repoPath), 'HEAD')
  }
  await runGit(args, { cwd: repoPath, timeoutMs: NETWORK_TIMEOUT })
}

// --- clone / link (hosting integration) -------------------------------------
//
// Clone authenticates with an optional token WITHOUT putting it in argv or in
// the saved remote: the token is passed via the CYREX_CLONE_TOKEN env var, read
// by an inline credential helper. The cloned remote keeps the clean https URL.
// On success we best-effort seed the user's own credential helper so ordinary
// fetch/push keep working (CLAUDE.md §4 prefers delegating to the system helper).

/** Hostname of an https URL, or null if it isn't a parseable https URL. */
function httpsHost(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' ? u.hostname : null
  } catch {
    return null
  }
}

/**
 * HTTPS credentials for clone/auth. `username` varies by provider:
 * `x-access-token` (GitHub), `oauth2` (GitLab token), or the account username
 * (Bitbucket app password). The secret is always carried in `password`.
 */
export interface CloneAuth {
  username: string
  password: string
}

/** Best-effort: hand the credentials to the user's git helper (if any). */
async function approveCredential(host: string, auth: CloneAuth): Promise<void> {
  const input = `protocol=https\nhost=${host}\nusername=${auth.username}\npassword=${auth.password}\n\n`
  try {
    await runGit(['credential', 'approve'], { input })
  } catch {
    /* no helper configured — clone still worked via the inline helper */
  }
}

/**
 * Clone `cloneUrl` into `parentDir/name` and return the new RepoRef. When `auth`
 * is given (private repo), it authenticates via an inline credential helper fed
 * through the environment — never argv, never the saved config.
 */
export async function cloneRepo(
  cloneUrl: string,
  parentDir: string,
  name: string,
  auth?: CloneAuth
): Promise<RepoRef> {
  const target = join(parentDir, name)
  if (existsSync(target)) throw new Error(`A folder named "${name}" already exists here.`)

  const args: string[] = []
  let env: Record<string, string> | undefined
  if (auth) {
    // Inline helper responds only to `get`, reading the secret from the env. The
    // helper code is in argv but carries no secret; user/password stay in env.
    const helper =
      '!f() { test "$1" = get && echo "username=$CYREX_CLONE_USER" && echo "password=$CYREX_CLONE_TOKEN"; }; f'
    args.push('-c', 'credential.helper=', '-c', `credential.helper=${helper}`)
    env = { CYREX_CLONE_USER: auth.username, CYREX_CLONE_TOKEN: auth.password }
  }
  args.push('clone', cloneUrl, target)
  await runGit(args, { cwd: parentDir, timeoutMs: NETWORK_TIMEOUT, env })

  const host = httpsHost(cloneUrl)
  if (auth && host) await approveCredential(host, auth)

  return openRepo(target)
}

/**
 * Point a repo's remote (default "origin") at `url`, adding it if missing. Used
 * to link a local repo to a freshly created remote.
 */
export async function setOrCreateRemote(
  repoPath: string,
  url: string,
  name = 'origin'
): Promise<void> {
  const { stdout } = await runGit(['remote'], { cwd: repoPath })
  const has = stdout.split('\n').map((r) => r.trim()).includes(name)
  await runGit(['remote', has ? 'set-url' : 'add', name, url], { cwd: repoPath })
}

// --- stash -----------------------------------------------------------------

export async function stashList(repoPath: string): Promise<Stash[]> {
  const fmt = ['%gd', '%H', '%cI', '%gs'].join(US)
  const { stdout } = await runGit(['stash', 'list', '-z', `--format=${fmt}`], { cwd: repoPath })

  const list: Stash[] = []
  for (const rec of stdout.split('\0')) {
    if (!rec.trim()) continue
    const [gd, sha, date, message] = rec.split(US)
    const m = gd.match(/stash@\{(\d+)\}/)
    list.push({ index: m ? Number(m[1]) : list.length, sha, date, message: message ?? '' })
  }
  return list
}

/** Stash the working tree (including untracked files). */
export async function stashSave(repoPath: string, message?: string): Promise<void> {
  const args = ['stash', 'push', '--include-untracked']
  if (message && message.trim()) args.push('-m', message.trim())
  await runGit(args, { cwd: repoPath })
}

/** Apply a stash, keeping it in the stack. Conflicts are surfaced, not hidden. */
export async function stashApply(repoPath: string, index: number): Promise<void> {
  await runGit(['stash', 'apply', `stash@{${index}}`], { cwd: repoPath })
}

/** Apply a stash and drop it on success. */
export async function stashPop(repoPath: string, index: number): Promise<void> {
  await runGit(['stash', 'pop', `stash@{${index}}`], { cwd: repoPath })
}

/** DESTRUCTIVE: discard a stash entry without applying it. */
export async function stashDrop(repoPath: string, index: number): Promise<void> {
  await runGit(['stash', 'drop', `stash@{${index}}`], { cwd: repoPath })
}

// --- worktrees --------------------------------------------------------------

/**
 * List the repository's worktrees. Parses `git worktree list --porcelain -z`,
 * where each worktree is a group of NUL-terminated attribute lines separated by
 * an empty token. The first entry is always the main working tree.
 */
export async function worktreeList(repoPath: string): Promise<Worktree[]> {
  const { stdout } = await runGit(['worktree', 'list', '--porcelain', '-z'], { cwd: repoPath })

  const list: Worktree[] = []
  let cur: Worktree | null = null
  const flush = (): void => {
    if (cur) list.push(cur)
    cur = null
  }
  for (const tok of stdout.split('\0')) {
    if (tok === '') {
      flush()
      continue
    }
    const sp = tok.indexOf(' ')
    const key = sp === -1 ? tok : tok.slice(0, sp)
    const val = sp === -1 ? '' : tok.slice(sp + 1)
    if (key === 'worktree') {
      cur = {
        path: val,
        head: null,
        branch: null,
        bare: false,
        detached: false,
        locked: false,
        prunable: false,
        isMain: list.length === 0
      }
    } else if (cur) {
      if (key === 'HEAD') cur.head = val
      else if (key === 'branch') cur.branch = val.replace(/^refs\/heads\//, '')
      else if (key === 'bare') cur.bare = true
      else if (key === 'detached') cur.detached = true
      else if (key === 'locked') cur.locked = true
      else if (key === 'prunable') cur.prunable = true
    }
  }
  flush()
  return list
}

/**
 * Add a worktree at `parentDir/name`, checking out `ref`. With `newBranch`, a
 * new branch named `ref` is created (from the current HEAD); otherwise `ref`
 * must be an existing branch/commit. Returns the new worktree as a RepoRef.
 */
export async function worktreeAdd(
  repoPath: string,
  parentDir: string,
  name: string,
  ref: string,
  newBranch = false
): Promise<RepoRef> {
  const target = join(parentDir, name)
  if (existsSync(target)) throw new Error(`A folder named "${name}" already exists here.`)
  const args = newBranch
    ? ['worktree', 'add', '-b', ref, target]
    : ['worktree', 'add', target, ref]
  await runGit(args, { cwd: repoPath })
  return openRepo(target)
}

/**
 * DESTRUCTIVE: remove a worktree (deletes its working-tree directory). `force`
 * is required when the worktree has uncommitted changes. The main worktree
 * cannot be removed.
 */
export async function worktreeRemove(
  repoPath: string,
  worktreePath: string,
  force = false
): Promise<void> {
  const args = ['worktree', 'remove']
  if (force) args.push('--force')
  args.push(worktreePath)
  await runGit(args, { cwd: repoPath })
}

// --- submodules -------------------------------------------------------------
//
// Cyrex reflects submodules as the nested repositories they are. Listing merges
// the declared modules from `.gitmodules` (name/path/url) with their live state
// from `git submodule status` (recorded sha + sync flag). Update/sync/add are
// thin wrappers; update clones content, so it is a network operation.

/** Map the leading flag of a `git submodule status` line to a status. */
function submoduleStatusFlag(flag: string): Submodule['status'] {
  if (flag === '+') return 'modified'
  if (flag === '-') return 'uninitialized'
  if (flag === 'U') return 'conflict'
  return 'upToDate'
}

/** List the repository's submodules with their working-tree status. */
export async function submodules(repoPath: string): Promise<Submodule[]> {
  const gitmodules = join(repoPath, '.gitmodules')
  if (!existsSync(gitmodules)) return []

  // Declared modules: parse `.gitmodules` (-z --list gives key\nvalue\0 records).
  const cfg = await runGit(['config', '--file', gitmodules, '-z', '--list'], {
    cwd: repoPath,
    throwOnError: false
  })
  const meta = new Map<string, { path?: string; url?: string }>()
  for (const entry of cfg.stdout.split('\0')) {
    if (!entry) continue
    const nl = entry.indexOf('\n')
    const key = nl === -1 ? entry : entry.slice(0, nl)
    const val = nl === -1 ? '' : entry.slice(nl + 1)
    const m = key.match(/^submodule\.(.+)\.(path|url)$/)
    if (!m) continue
    const rec = meta.get(m[1]) ?? {}
    if (m[2] === 'path') rec.path = val
    else rec.url = val
    meta.set(m[1], rec)
  }

  // Live status keyed by path: "<flag><sha> <path> [(describe)]".
  const st = await runGit(['submodule', 'status'], { cwd: repoPath, throwOnError: false })
  const byPath = new Map<string, { sha: string; status: Submodule['status']; describe: string | null }>()
  for (const line of st.stdout.split('\n')) {
    if (!line.trim()) continue
    const m = line.slice(1).match(/^([0-9a-f]+)\s+(.+?)(?:\s+\((.+)\))?$/)
    if (!m) continue
    byPath.set(m[2], {
      sha: m[1],
      status: submoduleStatusFlag(line[0]),
      describe: m[3] ?? null
    })
  }

  const list: Submodule[] = []
  for (const [name, rec] of meta) {
    if (!rec.path) continue
    const s = byPath.get(rec.path)
    list.push({
      name,
      path: rec.path,
      url: rec.url ?? '',
      sha: s?.sha ?? null,
      describe: s?.describe ?? null,
      status: s?.status ?? 'uninitialized'
    })
  }
  return list.sort((a, b) => a.path.localeCompare(b.path))
}

/** Update one submodule to the recorded commit; `init` checks it out first. */
export async function updateSubmodule(
  repoPath: string,
  subPath: string,
  init = false
): Promise<void> {
  const args = ['submodule', 'update']
  if (init) args.push('--init')
  args.push('--', subPath)
  await runGit(args, { cwd: repoPath, timeoutMs: NETWORK_TIMEOUT })
}

/** Initialize and update every submodule, recursively. */
export async function updateAllSubmodules(repoPath: string): Promise<void> {
  await runGit(['submodule', 'update', '--init', '--recursive'], {
    cwd: repoPath,
    timeoutMs: NETWORK_TIMEOUT
  })
}

/** Re-sync submodule remote URLs from `.gitmodules` into their configs. */
export async function syncSubmodules(repoPath: string, subPath?: string): Promise<void> {
  const args = ['submodule', 'sync']
  if (subPath) args.push('--', subPath)
  await runGit(args, { cwd: repoPath })
}

/** Add a new submodule at `subPath` cloned from `url` (a network operation). */
export async function addSubmodule(
  repoPath: string,
  url: string,
  subPath: string
): Promise<void> {
  await runGit(['submodule', 'add', '--', url, subPath], {
    cwd: repoPath,
    timeoutMs: NETWORK_TIMEOUT
  })
}

// --- Git LFS awareness ------------------------------------------------------
//
// Cyrex surfaces LFS state without taking it over: which patterns are tracked,
// which files are LFS objects, and whether each object's content is present
// locally or is still just a pointer. Pulls delegate credentials to the system
// git/lfs, like every other network operation (CLAUDE.md §4).

/** Repository-wide Git LFS status (no-op-friendly when git-lfs is absent). */
export async function lfsStatus(repoPath: string): Promise<LfsStatus> {
  const ver = await runGit(['lfs', 'version'], { cwd: repoPath, throwOnError: false })
  if (ver.code !== 0) return { installed: false, enabled: false, patterns: [], files: [] }

  // Tracked patterns from the root .gitattributes (lines with filter=lfs).
  const patterns: string[] = []
  const attrs = join(repoPath, '.gitattributes')
  if (existsSync(attrs)) {
    const text = await readFile(attrs, 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      if (/(^|\s)filter=lfs(\s|$)/.test(trimmed)) patterns.push(trimmed.split(/\s+/)[0])
    }
  }

  // LFS files + pointer/content state: "<oid> <*|-> <path>" (* = present).
  const ls = await runGit(['lfs', 'ls-files'], { cwd: repoPath, throwOnError: false })
  const files: LfsFile[] = []
  for (const line of ls.stdout.split('\n')) {
    if (!line.trim()) continue
    const m = line.match(/^(\S+)\s+([*-])\s+(.+)$/)
    if (!m) continue
    files.push({ oid: m[1], downloaded: m[2] === '*', path: m[3] })
  }

  return {
    installed: true,
    enabled: patterns.length > 0 || files.length > 0,
    patterns,
    files
  }
}

/** Download LFS content for the whole working tree, or a single file. */
export async function lfsPull(repoPath: string, file?: string): Promise<void> {
  const args = ['lfs', 'pull']
  if (file) args.push('--include', file)
  await runGit(args, { cwd: repoPath, timeoutMs: NETWORK_TIMEOUT })
}

/** Start tracking a glob pattern with LFS (writes `.gitattributes`). */
export async function lfsTrack(repoPath: string, pattern: string): Promise<void> {
  await runGit(['lfs', 'track', pattern], { cwd: repoPath })
}

// --- merge / cherry-pick / revert -------------------------------------------
//
// These can stop on conflicts; git exits non-zero and leaves conflict markers,
// which surfaces as an error to the user (never auto-resolved — CLAUDE.md §3).
// status().operation then reports the in-progress state so the UI can offer
// continue/abort.

/** Merge a ref into the current branch. */
export async function merge(repoPath: string, ref: string): Promise<void> {
  await runGit(['merge', '--no-edit', ref], { cwd: repoPath })
}

/**
 * Merge `source` into `target` (the drag-and-drop "drop source onto target"
 * gesture). Checks out `target` first so the merge lands on its tip, then merges.
 * Conflicts stop git and surface as an error; status().operation then drives the
 * in-progress UI (never auto-resolved — CLAUDE.md §3).
 */
export async function mergeBranch(
  repoPath: string,
  source: string,
  target: string
): Promise<void> {
  await runGit(['checkout', target], { cwd: repoPath })
  await runGit(['merge', '--no-edit', source], { cwd: repoPath })
}

/**
 * Rebase `branch` onto `onto` (drag-and-drop). Checks out `branch`, then replays
 * it onto the tip of `onto`. DESTRUCTIVE — rewrites history (recoverable via the
 * reflog / Undo); callers confirm. `--autostash` parks any working changes so the
 * rebase can start; a conflict pauses it for the in-progress UI to handle.
 */
export async function rebaseBranch(
  repoPath: string,
  branch: string,
  onto: string
): Promise<void> {
  await runGit(['checkout', branch], { cwd: repoPath })
  await runGit(['rebase', '--autostash', onto], { cwd: repoPath })
}

/** Apply the changes of a commit onto the current branch. */
export async function cherryPick(repoPath: string, sha: string): Promise<void> {
  await runGit(['cherry-pick', sha], { cwd: repoPath })
}

/** Create a new commit that undoes a commit. */
export async function revert(repoPath: string, sha: string): Promise<void> {
  await runGit(['revert', '--no-edit', sha], { cwd: repoPath })
}

/** Abort the in-progress merge/cherry-pick/revert/rebase, restoring HEAD. */
export async function abortOperation(repoPath: string): Promise<void> {
  const op = await detectOperation(repoPath)
  const cmd: Record<string, string> = {
    merge: 'merge',
    'cherry-pick': 'cherry-pick',
    revert: 'revert',
    rebase: 'rebase'
  }
  if (!op) throw new Error('No operation in progress to abort.')
  await runGit([cmd[op], '--abort'], { cwd: repoPath })
}

/** Continue the in-progress operation once conflicts have been staged. */
export async function continueOperation(repoPath: string): Promise<void> {
  const op = await detectOperation(repoPath)
  if (!op) throw new Error('No operation in progress to continue.')
  if (op === 'merge') {
    // `git merge --continue` needs nothing staged-specific; commit the result.
    await runGit(['commit', '--no-edit'], { cwd: repoPath })
  } else {
    await runGit([op, '--continue'], { cwd: repoPath })
  }
}

// --- conflict resolution ----------------------------------------------------
//
// A stopped merge/cherry-pick/revert/rebase leaves conflict markers in the
// working file. We surface each side so the user chooses (never auto-resolved —
// CLAUDE.md §3); resolving writes the chosen content and stages the file, which
// is what `git` treats as "resolved".

/** Read a conflicted file and structure its markers into ours/theirs segments. */
export async function readConflict(repoPath: string, file: string): Promise<ConflictFile> {
  const buf = await readFile(join(repoPath, file))
  if (buf.includes(0)) {
    // Binary conflicts can't be merged line-wise; resolve by picking a whole side.
    return { path: file, segments: [], conflicts: 0 }
  }
  return parseConflictText(file, buf.toString('utf8'))
}

/**
 * Write resolved content (markers removed) for a conflicted file and stage it.
 * Staging is how git records the conflict as resolved, which then lets the
 * in-progress operation continue.
 */
export async function resolveConflict(
  repoPath: string,
  file: string,
  content: string
): Promise<void> {
  await writeFile(join(repoPath, file), content)
  await runGit(['add', '--', file], { cwd: repoPath })
}

// --- interactive rebase -----------------------------------------------------
//
// Cyrex drives `git rebase -i` non-interactively: it computes the commit list,
// the user plans actions in the UI, and we install a generated todo via
// GIT_SEQUENCE_EDITOR. `reword` is a pick + a non-interactive `--amend`, so no
// message editor is ever spawned; `squash` accepts git's default combined
// message. History rewrites are recoverable through the reflog (the Undo
// surface). The renderer never sees any of this plumbing.

/** Absolute path to the repository's git directory. */
async function gitDir(repoPath: string): Promise<string> {
  const { stdout } = await runGit(['rev-parse', '--git-dir'], { cwd: repoPath })
  return resolve(repoPath, stdout.trim())
}

/**
 * The commits in base..HEAD that an interactive rebase can act on, oldest first
 * — the order a rebase todo presents them.
 */
export async function rebaseCommits(repoPath: string, base: string): Promise<Commit[]> {
  const { stdout } = await runGit(
    ['log', '--reverse', '--topo-order', `--format=${LOG_FORMAT}`, `${base}..HEAD`],
    { cwd: repoPath }
  )
  return parseCommits(stdout)
}

/**
 * Start an interactive rebase onto `base` following the planned `items`. Returns
 * whether it completed or paused (an `edit` stop or a conflict leaves the rebase
 * in progress for the operation banner to continue/abort).
 */
export async function interactiveRebase(
  repoPath: string,
  base: string,
  items: RebaseTodoItem[]
): Promise<RebaseResult> {
  if (items.length === 0) throw new Error('No commits to rebase.')

  const scratch = join(await gitDir(repoPath), 'cyrex-rebase')
  await rm(scratch, { recursive: true, force: true })
  await mkdir(scratch, { recursive: true })

  const lines: string[] = []
  let rewordN = 0
  for (const it of items) {
    if (it.action === 'drop') {
      lines.push(`drop ${it.sha}`)
    } else if (it.action === 'reword') {
      // Apply the commit, then rewrite its message non-interactively.
      const msgPath = join(scratch, `msg-${rewordN++}`)
      await writeFile(msgPath, (it.message ?? '').replace(/\s+$/, '') + '\n')
      lines.push(`pick ${it.sha}`)
      lines.push(`exec git commit --amend -F '${msgPath}'`)
    } else {
      lines.push(`${it.action} ${it.sha}`)
    }
  }
  const todoPath = join(scratch, 'todo')
  await writeFile(todoPath, lines.join('\n') + '\n')

  // git runs the sequence editor through the shell with the real todo path as an
  // argument, so `cp '<our-todo>'` becomes `cp '<our-todo>' <real-todo>` — i.e.
  // our plan overwrites git's generated todo. (POSIX; Windows is a follow-up.)
  const res = await runGit(['rebase', '-i', '--autostash', base], {
    cwd: repoPath,
    throwOnError: false,
    timeoutMs: 120_000,
    env: { GIT_SEQUENCE_EDITOR: `cp '${todoPath}'` }
  })

  // An `edit` stop exits 0 but leaves the rebase in progress, while a conflict
  // exits non-zero — so the authoritative "did it pause?" signal is whether a
  // rebase is still in progress, not the exit code. Keep the scratch dir while
  // paused: pending reword execs still reference their message files.
  if ((await detectOperation(repoPath)) === 'rebase') {
    return { completed: false, stopped: true }
  }

  await rm(scratch, { recursive: true, force: true })
  if (res.code === 0) return { completed: true, stopped: false }
  // Anything else (refuses merge commits, dirty tree, …) is a real failure.
  throw new Error(scrubSecrets(res.stderr.trim() || `rebase failed (code ${res.code})`))
}

export type ConflictSide = 'ours' | 'theirs'

/**
 * Resolve a conflicted file by taking one whole side (current vs. incoming) and
 * staging it. Works for binary conflicts too, where a line-wise merge is
 * impossible. Note git's `--ours`/`--theirs` are relative to the operation
 * (during a rebase they are swapped versus a merge) — the UI labels follow git.
 */
export async function resolveConflictSide(
  repoPath: string,
  file: string,
  side: ConflictSide
): Promise<void> {
  await runGit(['checkout', `--${side}`, '--', file], { cwd: repoPath })
  await runGit(['add', '--', file], { cwd: repoPath })
}

export async function tags(repoPath: string): Promise<Tag[]> {
  const fmt = ['%(refname:short)', '%(objectname)', '%(*objectname)', '%(objecttype)'].join(US)
  const { stdout } = await runGit(['for-each-ref', `--format=${fmt}`, 'refs/tags'], {
    cwd: repoPath
  })

  const list: Tag[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const [name, objectname, deref] = line.split(US)
    const annotated = Boolean(deref)
    list.push({ name, targetSha: annotated ? deref : objectname, annotated })
  }
  return list
}
