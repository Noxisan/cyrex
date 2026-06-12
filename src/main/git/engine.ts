/**
 * The Cyrex Git engine — the ONLY place Git is accessed (CLAUDE.md §3, §5).
 *
 * Public, command-equivalent operations the renderer can call (via IPC). Today
 * this is implemented on the system `git` CLI (cli.ts). The function surface is
 * deliberately backend-agnostic so a nodegit (libgit2) implementation can be
 * dropped in behind the same signatures later without touching the renderer.
 */

import { basename, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type {
  Branch,
  Commit,
  CommitDiff,
  DiffFile,
  FileStatus,
  FileStatusCode,
  LogOptions,
  RepoRef,
  RepoStatus,
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

export async function log(repoPath: string, options: LogOptions = {}): Promise<Commit[]> {
  const { limit = 200, skip = 0, ref } = options
  const format =
    [
      '%H', '%h', '%P', '%an', '%ae', '%aI', '%cn', '%ce', '%cI', '%D', '%s', '%b'
    ].join(US) + RS

  // --topo-order keeps branch lines contiguous so the lane graph reads cleanly
  // (default date order interleaves parallel branches).
  const args = ['log', '--topo-order', `--format=${format}`, `--max-count=${limit}`]
  if (skip > 0) args.push(`--skip=${skip}`)
  args.push(ref ?? '--all')

  const { stdout } = await runGit(args, { cwd: repoPath })

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
