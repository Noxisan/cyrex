/**
 * Zod schemas validating every inbound IPC payload in the main process
 * (CLAUDE.md §4: "Validate every IPC payload with zod"). A request that fails
 * validation is rejected before it can reach the Git engine.
 */

import { z } from 'zod'

export const repoPathSchema = z.object({
  path: z.string().min(1)
})

export const logSchema = z.object({
  path: z.string().min(1),
  options: z
    .object({
      limit: z.number().int().positive().max(5000).optional(),
      skip: z.number().int().nonnegative().optional(),
      ref: z.string().min(1).optional()
    })
    .optional()
})

export const commitDiffSchema = z.object({
  path: z.string().min(1),
  // A git object-ish ref: sha, short sha, branch/tag name. No whitespace, and
  // no control characters (checked by code point to avoid control-char regex).
  sha: z
    .string()
    .min(1)
    .max(255)
    .regex(/^\S+$/, 'invalid ref')
    .refine((s) => ![...s].some((c) => c.charCodeAt(0) < 0x20), 'invalid ref')
})

// A repo-relative file path. Reject absolute paths and parent-dir traversal so
// an operation can never escape the repository root.
const relFile = z
  .string()
  .min(1)
  .max(4096)
  .refine((p) => !p.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(p), 'must be repo-relative')
  .refine((p) => !p.split(/[\\/]/).includes('..'), 'path traversal not allowed')

export const fileOpSchema = z.object({
  path: z.string().min(1),
  file: relFile
})

export const workingDiffSchema = z.object({
  path: z.string().min(1),
  file: relFile,
  staged: z.boolean(),
  untracked: z.boolean()
})

export const discardSchema = z.object({
  path: z.string().min(1),
  file: relFile,
  untracked: z.boolean()
})

export const applyPartialSchema = z.object({
  path: z.string().min(1),
  file: relFile,
  hunkIndex: z.number().int().nonnegative(),
  lines: z.array(z.number().int().nonnegative()).optional(),
  op: z.enum(['stage', 'unstage', 'discard'])
})

export const commitSchema = z.object({
  path: z.string().min(1),
  message: z.string().min(1).max(20_000),
  amend: z.boolean().optional(),
  sign: z.boolean().optional()
})

// A ref or branch name: no whitespace/control chars, no leading '-', and none
// of git's forbidden sequences. git remains the final authority on validity.
const refName = z
  .string()
  .min(1)
  .max(255)
  .regex(/^\S+$/, 'invalid ref')
  .refine((s) => ![...s].some((c) => c.charCodeAt(0) < 0x20), 'invalid ref')
  .refine((s) => !s.startsWith('-'), 'invalid ref')
  .refine((s) => !/(\.\.|@\{|[~^:?*[\\])/.test(s), 'invalid ref')

export const checkoutSchema = z.object({ path: z.string().min(1), ref: refName })
export const checkoutRemoteSchema = z.object({
  path: z.string().min(1),
  remoteRef: refName
})
export const createBranchSchema = z.object({
  path: z.string().min(1),
  name: refName,
  startPoint: refName.optional(),
  checkout: z.boolean().optional()
})
export const renameBranchSchema = z.object({
  path: z.string().min(1),
  oldName: refName,
  newName: refName
})
export const deleteBranchSchema = z.object({
  path: z.string().min(1),
  name: refName,
  force: z.boolean().optional()
})

export const stashSaveSchema = z.object({
  path: z.string().min(1),
  message: z.string().max(20_000).optional()
})
export const stashIndexSchema = z.object({
  path: z.string().min(1),
  index: z.number().int().nonnegative().max(10_000)
})

export const pushSchema = z.object({
  path: z.string().min(1),
  force: z.boolean().optional()
})

export const searchSchema = z.object({
  path: z.string().min(1),
  query: z.string().min(1).max(500)
})

export const resetSchema = z.object({
  path: z.string().min(1),
  sha: refName,
  mode: z.enum(['soft', 'mixed', 'hard'])
})

export const resolveConflictSchema = z.object({
  path: z.string().min(1),
  file: relFile,
  // A resolved file can be large; cap generously to bound a hostile payload.
  content: z.string().max(20_000_000)
})

export const resolveSideSchema = z.object({
  path: z.string().min(1),
  file: relFile,
  side: z.enum(['ours', 'theirs'])
})

// A concrete object id (commit sha). Stricter than refName: hex only, so a
// generated rebase todo can never smuggle a flag or shell metacharacter.
const objectId = z
  .string()
  .min(4)
  .max(64)
  .regex(/^[0-9a-f]+$/i, 'invalid object id')

export const rebaseCommitsSchema = z.object({ path: z.string().min(1), base: refName })

export const interactiveRebaseSchema = z.object({
  path: z.string().min(1),
  base: refName,
  items: z
    .array(
      z.object({
        sha: objectId,
        action: z.enum(['pick', 'reword', 'squash', 'fixup', 'edit', 'drop']),
        message: z.string().max(20_000).optional()
      })
    )
    .min(1)
    .max(2000)
})

export const mergeSchema = z.object({ path: z.string().min(1), ref: refName })
export const mergeBranchSchema = z.object({
  path: z.string().min(1),
  source: refName,
  target: refName
})
export const rebaseBranchSchema = z.object({
  path: z.string().min(1),
  branch: refName,
  onto: refName
})
export const cherryPickSchema = z.object({ path: z.string().min(1), sha: refName })
export const revertSchema = z.object({ path: z.string().min(1), sha: refName })

// --- Remote hosting ---------------------------------------------------------

const providerId = z.enum(['github', 'gitlab', 'bitbucket'])

// `${provider}:${login}` — bounded, no control chars.
const accountId = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-z]+:.+$/, 'invalid account id')
  .refine((s) => !/\s/.test(s), 'invalid account id')
  .refine((s) => ![...s].some((c) => c.charCodeAt(0) < 0x20), 'invalid account id')

// A repository name on a provider (no path separators).
const repoName = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/, 'invalid repository name')

// HTTPS clone URL restricted to the supported hosts (defense in depth — the
// renderer only ever passes URLs the provider API returned).
const CLONE_HOSTS = new Set(['github.com', 'gitlab.com', 'bitbucket.org'])
const cloneUrl = z
  .string()
  .url()
  .refine((u) => {
    try {
      const url = new URL(u)
      return url.protocol === 'https:' && CLONE_HOSTS.has(url.hostname)
    } catch {
      return false
    }
  }, 'unsupported clone URL')

export const hostingStartLoginSchema = z.object({ provider: providerId })
export const hostingPollLoginSchema = z.object({ handle: z.string().min(8).max(64) })
export const hostingConnectTokenSchema = z.object({
  provider: providerId,
  token: z.string().min(1).max(500)
})
export const hostingDisconnectSchema = z.object({ id: accountId })
export const hostingListReposSchema = z.object({ accountId })
export const hostingCreateRepoSchema = z.object({
  accountId,
  name: repoName,
  description: z.string().max(2000).optional(),
  private: z.boolean()
})

// A folder name for a clone target: no separators or traversal.
const folderName = z
  .string()
  .min(1)
  .max(255)
  .refine((p) => !/[\\/]/.test(p) && p !== '.' && p !== '..', 'invalid folder name')

export const cloneSchema = z.object({
  cloneUrl,
  parentDir: z.string().min(1),
  name: folderName,
  accountId: accountId.optional()
})
export const setRemoteSchema = z.object({
  path: z.string().min(1),
  url: z.string().url(),
  name: refName.optional()
})

export const worktreeAddSchema = z.object({
  path: z.string().min(1),
  parentDir: z.string().min(1),
  name: folderName,
  ref: refName,
  newBranch: z.boolean().optional()
})
export const worktreeRemoveSchema = z.object({
  path: z.string().min(1),
  worktreePath: z.string().min(1),
  force: z.boolean().optional()
})

export type RepoPathRequest = z.infer<typeof repoPathSchema>
export type LogRequest = z.infer<typeof logSchema>
export type CommitDiffRequest = z.infer<typeof commitDiffSchema>
export type FileOpRequest = z.infer<typeof fileOpSchema>
export type WorkingDiffRequest = z.infer<typeof workingDiffSchema>
export type CommitRequest = z.infer<typeof commitSchema>
