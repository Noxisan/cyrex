/**
 * The single source of truth for the IPC surface between renderer and main.
 *
 * Every channel here is allow-listed in the preload bridge (src/preload) and
 * handled (with zod validation) in the main process (src/main/ipc). The
 * renderer must never reach Git except through these channels.
 */

import type {
  BlameLine,
  Branch,
  Commit,
  CommitContext,
  CommitDiff,
  ConflictFile,
  DeviceLoginStart,
  DiffSource,
  ImageVersions,
  DeviceLoginStatus,
  EngineResult,
  HostingAccount,
  HostingProviderId,
  LfsStatus,
  LogOptions,
  RebaseResult,
  RebaseTodoItem,
  ReflogEntry,
  RemoteRepo,
  RepoRef,
  RepoStatus,
  Stash,
  Submodule,
  Tag,
  Worktree
} from './types'

export const IpcChannels = {
  /** Open a folder picker and return the chosen repo (or null if cancelled). */
  RepoOpenDialog: 'repo:openDialog',
  /** Validate + register a repo path provided directly. */
  RepoOpen: 'repo:open',
  RepoStatus: 'repo:status',
  RepoLog: 'repo:log',
  RepoBranches: 'repo:branches',
  RepoTags: 'repo:tags',
  RepoCreateTag: 'repo:createTag',
  /** DESTRUCTIVE locally — removes the tag ref (a pushed tag stays on the remote). */
  RepoDeleteTag: 'repo:deleteTag',
  RepoPushTag: 'repo:pushTag',
  /** Structured diff for a single commit (against its first parent). */
  RepoCommitDiff: 'repo:commitDiff',
  /** Before/after image versions for an image file in a diff. */
  RepoImageVersions: 'repo:imageVersions',
  /** Diff for a single working-tree file (staged or unstaged). */
  RepoWorkingDiff: 'repo:workingDiff',
  RepoStage: 'repo:stage',
  RepoUnstage: 'repo:unstage',
  /** Stage/unstage/discard a single hunk or selected lines within it. */
  RepoApplyPartial: 'repo:applyPartial',
  /** DESTRUCTIVE — discard a file's working changes (must be confirmed). */
  RepoDiscard: 'repo:discard',
  RepoCommit: 'repo:commit',
  /** HEAD message + signing config for the commit box (amend / sign). */
  RepoCommitContext: 'repo:commitContext',
  /** Branch operations. */
  RepoCheckout: 'repo:checkout',
  RepoCheckoutRemote: 'repo:checkoutRemote',
  RepoCreateBranch: 'repo:createBranch',
  RepoRenameBranch: 'repo:renameBranch',
  /** DESTRUCTIVE when force is set (unmerged commits become unreachable). */
  RepoDeleteBranch: 'repo:deleteBranch',
  /** Stash operations. */
  RepoStashList: 'repo:stashList',
  RepoStashSave: 'repo:stashSave',
  RepoStashApply: 'repo:stashApply',
  RepoStashPop: 'repo:stashPop',
  /** DESTRUCTIVE — discards a stash without applying it. */
  RepoStashDrop: 'repo:stashDrop',
  /** Worktree operations. */
  RepoWorktreeList: 'repo:worktreeList',
  RepoWorktreeAdd: 'repo:worktreeAdd',
  /** DESTRUCTIVE — deletes the worktree's working-tree directory. */
  RepoWorktreeRemove: 'repo:worktreeRemove',
  /** Submodule operations (update/add clone content — network ops). */
  RepoSubmodules: 'repo:submodules',
  RepoSubmoduleUpdate: 'repo:submoduleUpdate',
  RepoSubmoduleUpdateAll: 'repo:submoduleUpdateAll',
  RepoSubmoduleSync: 'repo:submoduleSync',
  RepoSubmoduleAdd: 'repo:submoduleAdd',
  /** Git LFS awareness: status, pull content, track a pattern. */
  RepoLfsStatus: 'repo:lfsStatus',
  RepoLfsPull: 'repo:lfsPull',
  RepoLfsTrack: 'repo:lfsTrack',
  /** Visual .gitignore editing: read, write, live preview, quick-add a pattern. */
  RepoReadGitignore: 'repo:readGitignore',
  RepoWriteGitignore: 'repo:writeGitignore',
  RepoPreviewIgnore: 'repo:previewIgnore',
  RepoAddIgnore: 'repo:addIgnore',
  /** Network operations (credentials handled by the system git). */
  RepoFetch: 'repo:fetch',
  RepoPull: 'repo:pull',
  /** DESTRUCTIVE when force is set (force-with-lease can overwrite remote work). */
  RepoPush: 'repo:push',
  /** History operations (may stop on conflicts). */
  RepoMerge: 'repo:merge',
  /** Drag-and-drop: merge one branch into another (checks out the target). */
  RepoMergeBranch: 'repo:mergeBranch',
  /** DESTRUCTIVE — drag-and-drop rebase of one branch onto another (rewrites history). */
  RepoRebaseBranch: 'repo:rebaseBranch',
  RepoCherryPick: 'repo:cherryPick',
  RepoRevert: 'repo:revert',
  RepoContinueOp: 'repo:continueOperation',
  RepoAbortOp: 'repo:abortOperation',
  /** Interactive rebase: list the editable commits, then run the planned todo. */
  RepoRebaseCommits: 'repo:rebaseCommits',
  /** DESTRUCTIVE — rewrites history (recoverable via the reflog / Undo). */
  RepoInteractiveRebase: 'repo:interactiveRebase',
  /** Conflict resolution: read a conflicted file's sides, write the resolution. */
  RepoReadConflict: 'repo:readConflict',
  RepoResolveConflict: 'repo:resolveConflict',
  /** Resolve a conflict by taking one whole side (works for binary too). */
  RepoResolveSide: 'repo:resolveSide',
  /** Per-file inspection. */
  RepoFileHistory: 'repo:fileHistory',
  RepoBlame: 'repo:blame',
  /** Search commits by message, author, or sha. */
  RepoSearch: 'repo:search',
  /** Read HEAD's reflog (the undo / recovery surface). */
  RepoReflog: 'repo:reflog',
  /** DESTRUCTIVE when mode is 'hard' — move HEAD to a commit (reset). */
  RepoReset: 'repo:reset',
  /** Returns which engine backend is active (cli | nodegit). */
  EngineInfo: 'engine:info',
  /** Open a directory picker, returning the chosen path (or null). */
  PickDirectory: 'dialog:pickDirectory',
  // --- Remote hosting (GitHub / GitLab / Bitbucket). Tokens never cross IPC. ---
  /** Wired providers and whether each supports device-flow login. */
  HostingProviders: 'hosting:providers',
  /** Connected accounts (metadata only). */
  HostingListAccounts: 'hosting:listAccounts',
  /** Start OAuth device-flow login (shows a code, opens the browser). */
  HostingStartLogin: 'hosting:startLogin',
  /** Poll a device-flow login once; saves the account on success. */
  HostingPollLogin: 'hosting:pollLogin',
  /** Connect by pasting a personal access token. */
  HostingConnectToken: 'hosting:connectToken',
  /** Forget an account and its token. */
  HostingDisconnect: 'hosting:disconnect',
  /** List an account's repositories (metadata only). */
  HostingListRepos: 'hosting:listRepos',
  /** Create a repository on the provider. */
  HostingCreateRepo: 'hosting:createRepo',
  /** Clone a repo; the account's token is resolved in-process, not via IPC. */
  RepoClone: 'repo:clone',
  /** Point a repo's remote at a URL (link to a created remote). */
  RepoSetRemote: 'repo:setRemote'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

/**
 * Embedded-terminal channels. Kept separate from IpcApi because Data/Exit are
 * main→renderer streams (events), not request/response invocations. The
 * terminal runs user-initiated shell commands per the active repo (CLAUDE.md §8
 * embedded terminal); like every channel it is allow-listed in the preload.
 */
export const TerminalChannels = {
  Create: 'terminal:create',
  Run: 'terminal:run',
  Signal: 'terminal:signal',
  Dispose: 'terminal:dispose',
  Data: 'terminal:data',
  Exit: 'terminal:exit'
} as const

/**
 * Custom-titlebar window controls (the window is frameless). Parameterless
 * commands plus a query and a main→renderer push so the maximize/restore button
 * stays in sync with the real window state.
 */
export const WindowChannels = {
  Minimize: 'window:minimize',
  MaximizeToggle: 'window:maximizeToggle',
  Close: 'window:close',
  IsMaximized: 'window:isMaximized',
  /** main→renderer: emitted on maximize/unmaximize with the new boolean. */
  MaximizeChanged: 'window:maximizeChanged'
} as const

export interface EngineInfo {
  backend: 'cli' | 'nodegit'
  /** e.g. "git version 2.54.0" */
  version: string
}

/**
 * Typed request/response map. The renderer-facing `window.cyrex` API and the
 * main-process handlers are both derived from this so they cannot drift.
 */
export interface IpcApi {
  [IpcChannels.RepoOpenDialog]: {
    request: void
    response: EngineResult<RepoRef | null>
  }
  [IpcChannels.RepoOpen]: {
    request: { path: string }
    response: EngineResult<RepoRef>
  }
  [IpcChannels.RepoStatus]: {
    request: { path: string }
    response: EngineResult<RepoStatus>
  }
  [IpcChannels.RepoLog]: {
    request: { path: string; options?: LogOptions }
    response: EngineResult<Commit[]>
  }
  [IpcChannels.RepoBranches]: {
    request: { path: string }
    response: EngineResult<Branch[]>
  }
  [IpcChannels.RepoTags]: {
    request: { path: string }
    response: EngineResult<Tag[]>
  }
  [IpcChannels.RepoCreateTag]: {
    request: { path: string; name: string; ref?: string; message?: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoDeleteTag]: {
    request: { path: string; name: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoPushTag]: {
    request: { path: string; name: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoCommitDiff]: {
    request: { path: string; sha: string }
    response: EngineResult<CommitDiff>
  }
  [IpcChannels.RepoImageVersions]: {
    request: { path: string; file: string; source: DiffSource; oldPath?: string }
    response: EngineResult<ImageVersions>
  }
  [IpcChannels.RepoWorkingDiff]: {
    request: { path: string; file: string; staged: boolean; untracked: boolean }
    response: EngineResult<CommitDiff>
  }
  [IpcChannels.RepoStage]: {
    request: { path: string; file: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoUnstage]: {
    request: { path: string; file: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoApplyPartial]: {
    request: {
      path: string
      file: string
      hunkIndex: number
      lines?: number[]
      op: 'stage' | 'unstage' | 'discard'
    }
    response: EngineResult<null>
  }
  [IpcChannels.RepoDiscard]: {
    request: { path: string; file: string; untracked: boolean }
    response: EngineResult<null>
  }
  [IpcChannels.RepoCommit]: {
    request: { path: string; message: string; amend?: boolean; sign?: boolean }
    response: EngineResult<{ sha: string }>
  }
  [IpcChannels.RepoCommitContext]: {
    request: { path: string }
    response: EngineResult<CommitContext>
  }
  [IpcChannels.RepoCheckout]: {
    request: { path: string; ref: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoCheckoutRemote]: {
    request: { path: string; remoteRef: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoCreateBranch]: {
    request: { path: string; name: string; startPoint?: string; checkout?: boolean }
    response: EngineResult<null>
  }
  [IpcChannels.RepoRenameBranch]: {
    request: { path: string; oldName: string; newName: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoDeleteBranch]: {
    request: { path: string; name: string; force?: boolean }
    response: EngineResult<null>
  }
  [IpcChannels.RepoStashList]: {
    request: { path: string }
    response: EngineResult<Stash[]>
  }
  [IpcChannels.RepoStashSave]: {
    request: { path: string; message?: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoStashApply]: {
    request: { path: string; index: number }
    response: EngineResult<null>
  }
  [IpcChannels.RepoStashPop]: {
    request: { path: string; index: number }
    response: EngineResult<null>
  }
  [IpcChannels.RepoStashDrop]: {
    request: { path: string; index: number }
    response: EngineResult<null>
  }
  [IpcChannels.RepoWorktreeList]: {
    request: { path: string }
    response: EngineResult<Worktree[]>
  }
  [IpcChannels.RepoWorktreeAdd]: {
    request: { path: string; parentDir: string; name: string; ref: string; newBranch?: boolean }
    response: EngineResult<RepoRef>
  }
  [IpcChannels.RepoWorktreeRemove]: {
    request: { path: string; worktreePath: string; force?: boolean }
    response: EngineResult<null>
  }
  [IpcChannels.RepoSubmodules]: {
    request: { path: string }
    response: EngineResult<Submodule[]>
  }
  [IpcChannels.RepoSubmoduleUpdate]: {
    request: { path: string; subPath: string; init?: boolean }
    response: EngineResult<null>
  }
  [IpcChannels.RepoSubmoduleUpdateAll]: {
    request: { path: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoSubmoduleSync]: {
    request: { path: string; subPath?: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoSubmoduleAdd]: {
    request: { path: string; url: string; subPath: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoLfsStatus]: {
    request: { path: string }
    response: EngineResult<LfsStatus>
  }
  [IpcChannels.RepoLfsPull]: {
    request: { path: string; file?: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoLfsTrack]: {
    request: { path: string; pattern: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoReadGitignore]: {
    request: { path: string }
    response: EngineResult<string>
  }
  [IpcChannels.RepoWriteGitignore]: {
    request: { path: string; content: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoPreviewIgnore]: {
    request: { path: string; content: string }
    response: EngineResult<string[]>
  }
  [IpcChannels.RepoAddIgnore]: {
    request: { path: string; pattern: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoFetch]: {
    request: { path: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoPull]: {
    request: { path: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoPush]: {
    request: { path: string; force?: boolean }
    response: EngineResult<null>
  }
  [IpcChannels.RepoMerge]: {
    request: { path: string; ref: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoMergeBranch]: {
    request: { path: string; source: string; target: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoRebaseBranch]: {
    request: { path: string; branch: string; onto: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoCherryPick]: {
    request: { path: string; sha: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoRevert]: {
    request: { path: string; sha: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoContinueOp]: {
    request: { path: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoAbortOp]: {
    request: { path: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoRebaseCommits]: {
    request: { path: string; base: string }
    response: EngineResult<Commit[]>
  }
  [IpcChannels.RepoInteractiveRebase]: {
    request: { path: string; base: string; items: RebaseTodoItem[] }
    response: EngineResult<RebaseResult>
  }
  [IpcChannels.RepoReadConflict]: {
    request: { path: string; file: string }
    response: EngineResult<ConflictFile>
  }
  [IpcChannels.RepoResolveConflict]: {
    request: { path: string; file: string; content: string }
    response: EngineResult<null>
  }
  [IpcChannels.RepoResolveSide]: {
    request: { path: string; file: string; side: 'ours' | 'theirs' }
    response: EngineResult<null>
  }
  [IpcChannels.RepoFileHistory]: {
    request: { path: string; file: string }
    response: EngineResult<Commit[]>
  }
  [IpcChannels.RepoBlame]: {
    request: { path: string; file: string }
    response: EngineResult<BlameLine[]>
  }
  [IpcChannels.RepoSearch]: {
    request: { path: string; query: string }
    response: EngineResult<Commit[]>
  }
  [IpcChannels.RepoReflog]: {
    request: { path: string }
    response: EngineResult<ReflogEntry[]>
  }
  [IpcChannels.RepoReset]: {
    request: { path: string; sha: string; mode: 'soft' | 'mixed' | 'hard' }
    response: EngineResult<null>
  }
  [IpcChannels.EngineInfo]: {
    request: void
    response: EngineResult<EngineInfo>
  }
  [IpcChannels.PickDirectory]: {
    request: void
    response: EngineResult<string | null>
  }
  [IpcChannels.HostingProviders]: {
    request: void
    response: EngineResult<{ id: HostingProviderId; deviceFlow: boolean }[]>
  }
  [IpcChannels.HostingListAccounts]: {
    request: void
    response: EngineResult<HostingAccount[]>
  }
  [IpcChannels.HostingStartLogin]: {
    request: { provider: HostingProviderId }
    response: EngineResult<DeviceLoginStart>
  }
  [IpcChannels.HostingPollLogin]: {
    request: { handle: string }
    response: EngineResult<DeviceLoginStatus>
  }
  [IpcChannels.HostingConnectToken]: {
    request: { provider: HostingProviderId; token: string }
    response: EngineResult<HostingAccount>
  }
  [IpcChannels.HostingDisconnect]: {
    request: { id: string }
    response: EngineResult<null>
  }
  [IpcChannels.HostingListRepos]: {
    request: { accountId: string }
    response: EngineResult<RemoteRepo[]>
  }
  [IpcChannels.HostingCreateRepo]: {
    request: { accountId: string; name: string; description?: string; private: boolean }
    response: EngineResult<RemoteRepo>
  }
  [IpcChannels.RepoClone]: {
    request: { cloneUrl: string; parentDir: string; name: string; accountId?: string }
    response: EngineResult<RepoRef>
  }
  [IpcChannels.RepoSetRemote]: {
    request: { path: string; url: string; name?: string }
    response: EngineResult<null>
  }
}
