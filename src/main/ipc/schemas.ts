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
  message: z.string().min(1).max(20_000)
})

export type RepoPathRequest = z.infer<typeof repoPathSchema>
export type LogRequest = z.infer<typeof logSchema>
export type CommitDiffRequest = z.infer<typeof commitDiffSchema>
export type FileOpRequest = z.infer<typeof fileOpSchema>
export type WorkingDiffRequest = z.infer<typeof workingDiffSchema>
export type CommitRequest = z.infer<typeof commitSchema>
