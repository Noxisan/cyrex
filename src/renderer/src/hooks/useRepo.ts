/**
 * React Query hooks over the allow-listed window.cyrex bridge. Each hook
 * unwraps the EngineResult envelope: an { ok:false } from the engine becomes a
 * thrown error so components render real error states (never faked success).
 */

import { useQuery } from '@tanstack/react-query'
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
