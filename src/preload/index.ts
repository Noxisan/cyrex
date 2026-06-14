/**
 * The ONLY bridge between renderer and main. Every method here maps 1:1 to an
 * allow-listed IPC channel; no raw ipcRenderer is exposed (CLAUDE.md §4, §5).
 * Secrets never transit this layer — only repo metadata defined in @shared.
 */

import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels, TerminalChannels, WindowChannels } from '@shared/ipc'
import type { IpcApi } from '@shared/ipc'
import type {
  HostingProviderId,
  RebaseTodoItem,
  TerminalData,
  TerminalExit,
  TerminalSession
} from '@shared/types'

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
  commit: (path: string, message: string, amend?: boolean, sign?: boolean) =>
    invoke(IpcChannels.RepoCommit, { path, message, amend, sign }),
  commitContext: (path: string) => invoke(IpcChannels.RepoCommitContext, { path }),
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
  mergeBranch: (path: string, source: string, target: string) =>
    invoke(IpcChannels.RepoMergeBranch, { path, source, target }),
  rebaseBranch: (path: string, branch: string, onto: string) =>
    invoke(IpcChannels.RepoRebaseBranch, { path, branch, onto }),
  cherryPick: (path: string, sha: string) => invoke(IpcChannels.RepoCherryPick, { path, sha }),
  revert: (path: string, sha: string) => invoke(IpcChannels.RepoRevert, { path, sha }),
  continueOperation: (path: string) => invoke(IpcChannels.RepoContinueOp, { path }),
  abortOperation: (path: string) => invoke(IpcChannels.RepoAbortOp, { path }),
  rebaseCommits: (path: string, base: string) =>
    invoke(IpcChannels.RepoRebaseCommits, { path, base }),
  interactiveRebase: (path: string, base: string, items: RebaseTodoItem[]) =>
    invoke(IpcChannels.RepoInteractiveRebase, { path, base, items }),
  readConflict: (path: string, file: string) =>
    invoke(IpcChannels.RepoReadConflict, { path, file }),
  resolveConflict: (path: string, file: string, content: string) =>
    invoke(IpcChannels.RepoResolveConflict, { path, file, content }),
  resolveSide: (path: string, file: string, side: 'ours' | 'theirs') =>
    invoke(IpcChannels.RepoResolveSide, { path, file, side }),
  fileHistory: (path: string, file: string) =>
    invoke(IpcChannels.RepoFileHistory, { path, file }),
  blame: (path: string, file: string) => invoke(IpcChannels.RepoBlame, { path, file }),
  search: (path: string, query: string) => invoke(IpcChannels.RepoSearch, { path, query }),
  reflog: (path: string) => invoke(IpcChannels.RepoReflog, { path }),
  resetTo: (path: string, sha: string, mode: 'soft' | 'mixed' | 'hard') =>
    invoke(IpcChannels.RepoReset, { path, sha, mode }),

  /** Pick a folder (e.g. a clone destination); returns the path or null. */
  pickDirectory: () => invoke(IpcChannels.PickDirectory),
  cloneRepo: (cloneUrl: string, parentDir: string, name: string, accountId?: string) =>
    invoke(IpcChannels.RepoClone, { cloneUrl, parentDir, name, accountId }),
  setRemote: (path: string, url: string, name?: string) =>
    invoke(IpcChannels.RepoSetRemote, { path, url, name }),

  /**
   * Remote hosting (GitHub/GitLab/Bitbucket). Every method returns metadata
   * only — access tokens stay in the main process and the OS keychain and are
   * never exposed here (CLAUDE.md §4).
   */
  hosting: {
    providers: () => invoke(IpcChannels.HostingProviders),
    listAccounts: () => invoke(IpcChannels.HostingListAccounts),
    startLogin: (provider: HostingProviderId) =>
      invoke(IpcChannels.HostingStartLogin, { provider }),
    pollLogin: (handle: string) => invoke(IpcChannels.HostingPollLogin, { handle }),
    connectToken: (provider: HostingProviderId, token: string) =>
      invoke(IpcChannels.HostingConnectToken, { provider, token }),
    disconnect: (id: string) => invoke(IpcChannels.HostingDisconnect, { id }),
    listRepos: (accountId: string) => invoke(IpcChannels.HostingListRepos, { accountId }),
    createRepo: (
      accountId: string,
      input: { name: string; description?: string; private: boolean }
    ) => invoke(IpcChannels.HostingCreateRepo, { accountId, ...input })
  },

  /**
   * Custom-titlebar window controls (frameless window). No secrets, no payload —
   * just min/maximize/close plus a maximized-state query and subscription.
   */
  windowControls: {
    minimize: (): Promise<void> => ipcRenderer.invoke(WindowChannels.Minimize),
    maximizeToggle: (): Promise<boolean> => ipcRenderer.invoke(WindowChannels.MaximizeToggle),
    close: (): Promise<void> => ipcRenderer.invoke(WindowChannels.Close),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(WindowChannels.IsMaximized),
    onMaximizeChange: (cb: (isMax: boolean) => void): (() => void) => {
      const listener = (_e: unknown, isMax: boolean): void => cb(isMax)
      ipcRenderer.on(WindowChannels.MaximizeChanged, listener)
      return () => ipcRenderer.removeListener(WindowChannels.MaximizeChanged, listener)
    }
  },

  /**
   * Embedded terminal. Data/Exit are main→renderer streams, so we expose
   * subscribe helpers that wrap ipcRenderer.on (never ipcRenderer itself) and
   * return an unsubscribe function.
   */
  terminal: {
    create: (cwd: string): Promise<TerminalSession> =>
      ipcRenderer.invoke(TerminalChannels.Create, { cwd }),
    run: (id: string, command: string): Promise<void> =>
      ipcRenderer.invoke(TerminalChannels.Run, { id, command }),
    signal: (id: string): Promise<void> => ipcRenderer.invoke(TerminalChannels.Signal, { id }),
    dispose: (id: string): Promise<void> => ipcRenderer.invoke(TerminalChannels.Dispose, { id }),
    onData: (cb: (d: TerminalData) => void): (() => void) => {
      const listener = (_e: unknown, payload: TerminalData): void => cb(payload)
      ipcRenderer.on(TerminalChannels.Data, listener)
      return () => ipcRenderer.removeListener(TerminalChannels.Data, listener)
    },
    onExit: (cb: (e: TerminalExit) => void): (() => void) => {
      const listener = (_e: unknown, payload: TerminalExit): void => cb(payload)
      ipcRenderer.on(TerminalChannels.Exit, listener)
      return () => ipcRenderer.removeListener(TerminalChannels.Exit, listener)
    }
  }
}

export type CyrexApi = typeof cyrexApi

contextBridge.exposeInMainWorld('cyrex', cyrexApi)
