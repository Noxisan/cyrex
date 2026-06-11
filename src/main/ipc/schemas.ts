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

export type RepoPathRequest = z.infer<typeof repoPathSchema>
export type LogRequest = z.infer<typeof logSchema>
