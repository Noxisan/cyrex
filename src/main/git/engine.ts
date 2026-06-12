/**
 * The Cyrex Git engine — the ONLY place Git is accessed (CLAUDE.md §3, §5).
 *
 * Public, command-equivalent operations the renderer can call (via IPC). Today
 * this is implemented on the system `git` CLI (cli.ts). The function surface is
 * deliberately backend-agnostic so a nodegit (libgit2) implementation can be
 * dropped in behind the same signatures later without touching the renderer.
 */

import { basename, join, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type {
  BlameLine,
  Branch,
  Commit,
  CommitDiff,
  DiffFile,
  FileStatus,
  FileStatusCode,
  LogOptions,
  RepoOperation,
  RepoRef,
  RepoStatus,
  Stash,
  Tag
} from '@shared/types'
import { gitVersion, isGitRepo, runGit } from './cli'
import { parseUnifiedDiff } from './diff'
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

/** Create a commit from the staged index. Returns the new HEAD sha. */
export async function commit(repoPath: string, message: string): Promise<CommitResult> {
  const trimmed = message.trim()
  if (trimmed.length === 0) throw new Error('Commit message must not be empty.')
  await runGit(['commit', '-m', trimmed], { cwd: repoPath })
  const { stdout } = await runGit(['rev-parse', 'HEAD'], { cwd: repoPath })
  return { sha: stdout.trim() }
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
