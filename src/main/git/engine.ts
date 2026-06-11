/**
 * The Cyrex Git engine — the ONLY place Git is accessed (CLAUDE.md §3, §5).
 *
 * Public, command-equivalent operations the renderer can call (via IPC). Today
 * this is implemented on the system `git` CLI (cli.ts). The function surface is
 * deliberately backend-agnostic so a nodegit (libgit2) implementation can be
 * dropped in behind the same signatures later without touching the renderer.
 */

import { basename } from 'node:path'
import type {
  Branch,
  Commit,
  FileStatus,
  FileStatusCode,
  LogOptions,
  RepoRef,
  RepoStatus,
  Tag
} from '@shared/types'
import { gitVersion, isGitRepo, runGit } from './cli'

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

  const args = ['log', `--format=${format}`, `--max-count=${limit}`]
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
