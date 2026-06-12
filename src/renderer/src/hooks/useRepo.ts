/**
 * React Query hooks over the allow-listed window.cyrex bridge. Each hook
 * unwraps the EngineResult envelope: an { ok:false } from the engine becomes a
 * thrown error so components render real error states (never faked success).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { EngineResult, LogOptions } from '@shared/types'

function unwrap<T>(res: EngineResult<T>): T {
  if (!res.ok) throw new Error(res.error)
  return res.data
}

export function useEngineInfo() {
  return useQuery({
    queryKey: ['engineInfo'],
    queryFn: async () => unwrap(await window.cyrex.engineInfo())
  })
}

export function useStatus(path: string | null) {
  return useQuery({
    queryKey: ['status', path],
    enabled: !!path,
    queryFn: async () => unwrap(await window.cyrex.status(path!))
  })
}

export function useLog(path: string | null, options?: LogOptions) {
  return useQuery({
    queryKey: ['log', path, options],
    enabled: !!path,
    queryFn: async () => unwrap(await window.cyrex.log(path!, options))
  })
}

export function useBranches(path: string | null) {
  return useQuery({
    queryKey: ['branches', path],
    enabled: !!path,
    queryFn: async () => unwrap(await window.cyrex.branches(path!))
  })
}

export function useTags(path: string | null) {
  return useQuery({
    queryKey: ['tags', path],
    enabled: !!path,
    queryFn: async () => unwrap(await window.cyrex.tags(path!))
  })
}

export function useCommitDiff(path: string | null, sha: string | null) {
  return useQuery({
    queryKey: ['commitDiff', path, sha],
    enabled: !!path && !!sha,
    // Diffs are immutable for a given commit — cache them aggressively.
    staleTime: 5 * 60_000,
    queryFn: async () => unwrap(await window.cyrex.commitDiff(path!, sha!))
  })
}

export function useWorkingDiff(
  path: string | null,
  file: string | null,
  staged: boolean,
  untracked: boolean
) {
  return useQuery({
    queryKey: ['workingDiff', path, file, staged, untracked],
    enabled: !!path && !!file,
    queryFn: async () => unwrap(await window.cyrex.workingDiff(path!, file!, staged, untracked))
  })
}

/** Invalidate everything a working-tree mutation can affect. */
function useRepoMutation<TVars>(fn: (vars: TVars) => Promise<EngineResult<unknown>>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: TVars) => unwrap(await fn(vars)),
    onSuccess: () => {
      for (const key of ['status', 'workingDiff', 'log', 'branches']) {
        void qc.invalidateQueries({ queryKey: [key] })
      }
    }
  })
}

export function useStage(path: string) {
  return useRepoMutation((file: string) => window.cyrex.stage(path, file))
}

export function useUnstage(path: string) {
  return useRepoMutation((file: string) => window.cyrex.unstage(path, file))
}

export function useDiscard(path: string) {
  return useRepoMutation((v: { file: string; untracked: boolean }) =>
    window.cyrex.discard(path, v.file, v.untracked)
  )
}

export function useCommit(path: string) {
  return useRepoMutation((message: string) => window.cyrex.commit(path, message))
}
