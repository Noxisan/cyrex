/**
 * React Query hooks over the allow-listed window.cyrex bridge. Each hook
 * unwraps the EngineResult envelope: an { ok:false } from the engine becomes a
 * thrown error so components render real error states (never faked success).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { EngineResult, LogOptions, RebaseTodoItem } from '@shared/types'
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

export function useFileHistory(path: string | null, file: string | null) {
  return useQuery({
    queryKey: ['fileHistory', path, file],
    enabled: !!path && !!file,
    queryFn: async () => unwrap(await window.cyrex.fileHistory(path!, file!))
  })
}

export function useBlame(path: string | null, file: string | null) {
  return useQuery({
    queryKey: ['blame', path, file],
    enabled: !!path && !!file,
    queryFn: async () => unwrap(await window.cyrex.blame(path!, file!))
  })
}

export function useSearch(path: string | null, query: string) {
  return useQuery({
    queryKey: ['search', path, query],
    enabled: !!path && query.trim().length > 0,
    queryFn: async () => unwrap(await window.cyrex.search(path!, query.trim()))
  })
}

export function useReflog(path: string | null, enabled = true) {
  return useQuery({
    queryKey: ['reflog', path],
    enabled: !!path && enabled,
    queryFn: async () => unwrap(await window.cyrex.reflog(path!))
  })
}

export function useResetTo(path: string) {
  return useRepoMutation((v: { sha: string; mode: 'soft' | 'mixed' | 'hard' }) =>
    window.cyrex.resetTo(path, v.sha, v.mode)
  )
}

export function useRebaseCommits(path: string | null, base: string | null) {
  return useQuery({
    queryKey: ['rebaseCommits', path, base],
    enabled: !!path && !!base,
    queryFn: async () => unwrap(await window.cyrex.rebaseCommits(path!, base!))
  })
}

export function useInteractiveRebase(path: string) {
  return useRepoMutation((v: { base: string; items: RebaseTodoItem[] }) =>
    window.cyrex.interactiveRebase(path, v.base, v.items)
  )
}

export function useConflict(path: string | null, file: string | null) {
  return useQuery({
    queryKey: ['conflict', path, file],
    enabled: !!path && !!file,
    queryFn: async () => unwrap(await window.cyrex.readConflict(path!, file!))
  })
}

export function useResolveConflict(path: string) {
  return useRepoMutation((v: { file: string; content: string }) =>
    window.cyrex.resolveConflict(path, v.file, v.content)
  )
}

export function useResolveSide(path: string) {
  return useRepoMutation((v: { file: string; side: 'ours' | 'theirs' }) =>
    window.cyrex.resolveSide(path, v.file, v.side)
  )
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
 * as a toast so operations never fail silently. An optional success message is
 * toasted on completion (used for network ops that otherwise give no feedback).
 */
function useRepoMutation<TVars>(
  fn: (vars: TVars) => Promise<EngineResult<unknown>>,
  successMessage?: string
) {
  const qc = useQueryClient()
  const pushToast = useToastStore((s) => s.push)
  return useMutation({
    mutationFn: async (vars: TVars) => unwrap(await fn(vars)),
    onSuccess: () => {
      for (const key of [
        'status',
        'workingDiff',
        'log',
        'branches',
        'tags',
        'stashes',
        'reflog',
        'conflict',
        'commitContext'
      ]) {
        void qc.invalidateQueries({ queryKey: [key] })
      }
      if (successMessage) pushToast(successMessage, 'success')
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

export function useStashes(path: string | null) {
  return useQuery({
    queryKey: ['stashes', path],
    enabled: !!path,
    queryFn: async () => unwrap(await window.cyrex.stashList(path!))
  })
}

export function useStashSave(path: string) {
  return useRepoMutation((message?: string) => window.cyrex.stashSave(path, message))
}

export function useStashApply(path: string) {
  return useRepoMutation((index: number) => window.cyrex.stashApply(path, index))
}

export function useStashPop(path: string) {
  return useRepoMutation((index: number) => window.cyrex.stashPop(path, index))
}

export function useStashDrop(path: string) {
  return useRepoMutation((index: number) => window.cyrex.stashDrop(path, index))
}

export function useFetch(path: string) {
  const { t } = useTranslation()
  return useRepoMutation(() => window.cyrex.fetch(path), t('remote.fetched'))
}

export function usePull(path: string) {
  const { t } = useTranslation()
  return useRepoMutation(() => window.cyrex.pull(path), t('remote.pulled'))
}

export function usePush(path: string) {
  const { t } = useTranslation()
  return useRepoMutation((force?: boolean) => window.cyrex.push(path, force), t('remote.pushed'))
}

export function useMerge(path: string) {
  return useRepoMutation((ref: string) => window.cyrex.merge(path, ref))
}

export function useCherryPick(path: string) {
  return useRepoMutation((sha: string) => window.cyrex.cherryPick(path, sha))
}

export function useRevert(path: string) {
  return useRepoMutation((sha: string) => window.cyrex.revert(path, sha))
}

export function useContinueOperation(path: string) {
  return useRepoMutation(() => window.cyrex.continueOperation(path))
}

export function useAbortOperation(path: string) {
  return useRepoMutation(() => window.cyrex.abortOperation(path))
}

export function useCommit(path: string) {
  return useRepoMutation((v: { message: string; amend?: boolean; sign?: boolean }) =>
    window.cyrex.commit(path, v.message, v.amend, v.sign)
  )
}

export function useCommitContext(path: string | null) {
  return useQuery({
    queryKey: ['commitContext', path],
    enabled: !!path,
    queryFn: async () => unwrap(await window.cyrex.commitContext(path!))
  })
}
