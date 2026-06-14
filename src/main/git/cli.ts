/**
 * System `git` spawn helpers.
 *
 * This is the lowest layer of the engine. It runs the user's installed git
 * binary with explicit, machine-readable flags and returns raw stdout for the
 * parsers in engine.ts. Rules (CLAUDE.md §3, §4):
 *   - Always parse porcelain / -z / --format output, never human text.
 *   - Never log credentials; scrub anything that looks like a token from errors.
 *   - Heavy work stays in the main process; the renderer never spawns git.
 */

import { spawn } from 'node:child_process'

export class GitError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly stderr: string
  ) {
    super(message)
    this.name = 'GitError'
  }
}

/** Strip values that look like credentials from text before it is surfaced. */
export function scrubSecrets(text: string): string {
  return text
    // https://user:token@host -> https://user:***@host
    .replace(/(https?:\/\/[^:/\s]+:)[^@\s]+@/gi, '$1***@')
    // Authorization headers, bearer tokens, common token shapes
    .replace(/(authorization:\s*\S+)/gi, 'authorization: ***')
    .replace(/(gh[pousr]_[A-Za-z0-9]{20,})/g, '***')
}

export interface GitRunOptions {
  /** Working directory; required for repo operations. */
  cwd?: string
  /** Hard timeout in ms. */
  timeoutMs?: number
  /** Reject the promise on a non-zero exit (default true). */
  throwOnError?: boolean
  /** Text written to the process's stdin (e.g. a patch for `git apply`). */
  input?: string
  /**
   * Extra environment variables, merged over the stable defaults. Used to drive
   * non-interactive flows that need a custom editor — e.g. installing a generated
   * todo list for `rebase -i` via GIT_SEQUENCE_EDITOR.
   */
  env?: Record<string, string>
}

export interface GitRunResult {
  stdout: string
  stderr: string
  code: number | null
}

/**
 * Run git once and buffer its output. For large/streaming output (full history
 * walks, big diffs) prefer a streaming variant — added as the engine grows.
 */
export function runGit(args: string[], opts: GitRunOptions = {}): Promise<GitRunResult> {
  const { cwd, timeoutMs = 30_000, throwOnError = true, input, env } = opts

  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      // Stable, machine-parseable output regardless of the user's environment.
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        LC_ALL: 'C',
        GIT_OPTIONAL_LOCKS: '0',
        // A GUI never wants an interactive editor; accept default messages.
        GIT_EDITOR: 'true',
        GIT_SEQUENCE_EDITOR: 'true',
        // Per-call overrides (e.g. a generated rebase-todo sequence editor).
        ...env
      },
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new GitError(`git ${args[0]} timed out after ${timeoutMs}ms`, null, ''))
    }, timeoutMs)

    if (input !== undefined) {
      child.stdin.on('error', () => {
        /* ignore EPIPE if git exits before consuming all input */
      })
      child.stdin.end(input)
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (d: string) => (stdout += d))
    child.stderr.on('data', (d: string) => (stderr += d))

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new GitError(scrubSecrets(err.message), null, ''))
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0 && throwOnError) {
        const clean = scrubSecrets(stderr.trim() || `git exited with code ${code}`)
        reject(new GitError(clean, code, scrubSecrets(stderr)))
        return
      }
      resolve({ stdout, stderr, code })
    })
  })
}

export interface GitBufferResult {
  /** Raw stdout bytes (not decoded — safe for binary blobs like images). */
  stdout: Buffer
  stderr: string
  code: number | null
}

/**
 * Run git and buffer stdout as raw bytes — for binary content (e.g. `git show
 * <rev>:<image>`) where utf8 decoding would corrupt the data. stderr is still
 * decoded as text for error reporting.
 */
export function runGitBuffer(args: string[], opts: GitRunOptions = {}): Promise<GitBufferResult> {
  const { cwd, timeoutMs = 30_000, throwOnError = true, input, env } = opts

  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        LC_ALL: 'C',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_EDITOR: 'true',
        GIT_SEQUENCE_EDITOR: 'true',
        ...env
      },
      windowsHide: true
    })

    const chunks: Buffer[] = []
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new GitError(`git ${args[0]} timed out after ${timeoutMs}ms`, null, ''))
    }, timeoutMs)

    if (input !== undefined) {
      child.stdin.on('error', () => {
        /* ignore EPIPE */
      })
      child.stdin.end(input)
    }

    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    child.stderr.on('data', (d: string) => (stderr += d))

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new GitError(scrubSecrets(err.message), null, ''))
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0 && throwOnError) {
        reject(new GitError(scrubSecrets(stderr.trim() || `git exited with code ${code}`), code, scrubSecrets(stderr)))
        return
      }
      resolve({ stdout: Buffer.concat(chunks), stderr, code })
    })
  })
}

/** Resolve the installed git version, or throw GitError if git is missing. */
export async function gitVersion(): Promise<string> {
  const { stdout } = await runGit(['--version'])
  return stdout.trim()
}

/** True when `dir` is inside a git work tree. */
export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const { stdout } = await runGit(['rev-parse', '--is-inside-work-tree'], { cwd: dir })
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}
