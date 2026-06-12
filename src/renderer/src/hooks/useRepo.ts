/**
 * React Query hooks over the allow-listed window.cyrex bridge. Each hook
 * unwraps the EngineResult envelope: an { ok:false } from the engine becomes a
 * thrown error so components render real error states (never faked success).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { EngineResult, LogOptions } from '@shared/types'
import { useToastStore } from '../store/toastStore'

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

/**
 * Invalidate everything a repo mutation can affect, and surface any Git error
 * as a toast so operations never fail silently.
 */
function useRepoMutation<TVars>(fn: (vars: TVars) => Promise<EngineResult<unknown>>) {
  const qc = useQueryClient()
  const pushToast = useToastStore((s) => s.push)
  return useMutation({
    mutationFn: async (vars: TVars) => unwrap(await fn(vars)),
    onSuccess: () => {
      for (const key of ['status', 'workingDiff', 'log', 'branches', 'tags']) {
        void qc.invalidateQueries({ queryKey: [key] })
      }
    },
    onError: (err) => pushToast((err as Error).message, 'error')
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

export function useApplyPartial(path: string) {
  return useRepoMutation(
    (v: {
      file: string
      hunkIndex: number
      op: 'stage' | 'unstage' | 'discard'
      lines?: number[]
    }) => window.cyrex.applyPartial(path, v.file, v.hunkIndex, v.op, v.lines)
  )
}

export function useCheckout(path: string) {
  return useRepoMutation((ref: string) => window.cyrex.checkout(path, ref))
}

export function useCheckoutRemote(path: string) {
  return useRepoMutation((remoteRef: string) => window.cyrex.checkoutRemote(path, remoteRef))
}

export function useCreateBranch(path: string) {
  return useRepoMutation((v: { name: string; startPoint?: string; checkout?: boolean }) =>
    window.cyrex.createBranch(path, v.name, v.startPoint, v.checkout)
  )
}

export function useRenameBranch(path: string) {
  return useRepoMutation((v: { oldName: string; newName: string }) =>
    window.cyrex.renameBranch(path, v.oldName, v.newName)
  )
}

export function useDeleteBranch(path: string) {
  return useRepoMutation((v: { name: string; force?: boolean }) =>
    window.cyrex.deleteBranch(path, v.name, v.force)
  )
}

export function useCommit(path: string) {
  return useRepoMutation((message: string) => window.cyrex.commit(path, message))
}
