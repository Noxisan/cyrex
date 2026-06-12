/**
 * The ONLY bridge between renderer and main. Every method here maps 1:1 to an
 * allow-listed IPC channel; no raw ipcRenderer is exposed (CLAUDE.md §4, §5).
 * Secrets never transit this layer — only repo metadata defined in @shared.
 */

import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type { IpcApi } from '@shared/ipc'

type Req<C extends keyof IpcApi> = IpcApi[C]['request']
type Res<C extends keyof IpcApi> = IpcApi[C]['response']

function invoke<C extends keyof IpcApi>(channel: C, payload?: Req<C>): Promise<Res<C>> {
  return ipcRenderer.invoke(channel as string, payload) as Promise<Res<C>>
}

export const cyrexApi = {
  engineInfo: () => invoke(IpcChannels.EngineInfo),
  openRepoDialog: () => invoke(IpcChannels.RepoOpenDialog),
  openRepo: (path: string) => invoke(IpcChannels.RepoOpen, { path }),
  status: (path: string) => invoke(IpcChannels.RepoStatus, { path }),
  log: (path: string, options?: Req<typeof IpcChannels.RepoLog>['options']) =>
    invoke(IpcChannels.RepoLog, { path, options }),
  branches: (path: string) => invoke(IpcChannels.RepoBranches, { path }),
  tags: (path: string) => invoke(IpcChannels.RepoTags, { path }),
  commitDiff: (path: string, sha: string) =>
    invoke(IpcChannels.RepoCommitDiff, { path, sha }),
  workingDiff: (path: string, file: string, staged: boolean, untracked: boolean) =>
    invoke(IpcChannels.RepoWorkingDiff, { path, file, staged, untracked }),
  stage: (path: string, file: string) => invoke(IpcChannels.RepoStage, { path, file }),
  unstage: (path: string, file: string) => invoke(IpcChannels.RepoUnstage, { path, file }),
  applyPartial: (
    path: string,
    file: string,
    hunkIndex: number,
    op: 'stage' | 'unstage' | 'discard',
    lines?: number[]
  ) => invoke(IpcChannels.RepoApplyPartial, { path, file, hunkIndex, lines, op }),
  discard: (path: string, file: string, untracked: boolean) =>
    invoke(IpcChannels.RepoDiscard, { path, file, untracked }),
  commit: (path: string, message: string) => invoke(IpcChannels.RepoCommit, { path, message }),
  checkout: (path: string, ref: string) => invoke(IpcChannels.RepoCheckout, { path, ref }),
  checkoutRemote: (path: string, remoteRef: string) =>
    invoke(IpcChannels.RepoCheckoutRemote, { path, remoteRef }),
  createBranch: (path: string, name: string, startPoint?: string, checkout?: boolean) =>
    invoke(IpcChannels.RepoCreateBranch, { path, name, startPoint, checkout }),
  renameBranch: (path: string, oldName: string, newName: string) =>
    invoke(IpcChannels.RepoRenameBranch, { path, oldName, newName }),
  deleteBranch: (path: string, name: string, force?: boolean) =>
    invoke(IpcChannels.RepoDeleteBranch, { path, name, force }),
  stashList: (path: string) => invoke(IpcChannels.RepoStashList, { path }),
  stashSave: (path: string, message?: string) =>
    invoke(IpcChannels.RepoStashSave, { path, message }),
  stashApply: (path: string, index: number) =>
    invoke(IpcChannels.RepoStashApply, { path, index }),
  stashPop: (path: string, index: number) => invoke(IpcChannels.RepoStashPop, { path, index }),
  stashDrop: (path: string, index: number) => invoke(IpcChannels.RepoStashDrop, { path, index }),
  fetch: (path: string) => invoke(IpcChannels.RepoFetch, { path }),
  pull: (path: string) => invoke(IpcChannels.RepoPull, { path }),
  push: (path: string, force?: boolean) => invoke(IpcChannels.RepoPush, { path, force }),
  merge: (path: string, ref: string) => invoke(IpcChannels.RepoMerge, { path, ref }),
  cherryPick: (path: string, sha: string) => invoke(IpcChannels.RepoCherryPick, { path, sha }),
  revert: (path: string, sha: string) => invoke(IpcChannels.RepoRevert, { path, sha }),
  continueOperation: (path: string) => invoke(IpcChannels.RepoContinueOp, { path }),
  abortOperation: (path: string) => invoke(IpcChannels.RepoAbortOp, { path })
}

export type CyrexApi = typeof cyrexApi

contextBridge.exposeInMainWorld('cyrex', cyrexApi)
