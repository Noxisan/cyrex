/**
 * The single source of truth for the IPC surface between renderer and main.
 *
 * Every channel here is allow-listed in the preload bridge (src/preload) and
 * handled (with zod validation) in the main process (src/main/ipc). The
 * renderer must never reach Git except through these channels.
 */

import type {
  Branch,
  Commit,
  CommitDiff,
  EngineResult,
  LogOptions,
  RepoRef,
  RepoStatus,
  Tag
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
  /** Structured diff for a single commit (against its first parent). */
  RepoCommitDiff: 'repo:commitDiff',
  /** Diff for a single working-tree file (staged or unstaged). */
  RepoWorkingDiff: 'repo:workingDiff',
  RepoStage: 'repo:stage',
  RepoUnstage: 'repo:unstage',
  /** Stage/unstage/discard a single hunk or selected lines within it. */
  RepoApplyPartial: 'repo:applyPartial',
  /** DESTRUCTIVE — discard a file's working changes (must be confirmed). */
  RepoDiscard: 'repo:discard',
  RepoCommit: 'repo:commit',
  /** Returns which engine backend is active (cli | nodegit). */
  EngineInfo: 'engine:info'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

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
  [IpcChannels.RepoCommitDiff]: {
    request: { path: string; sha: string }
    response: EngineResult<CommitDiff>
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
    request: { path: string; message: string }
    response: EngineResult<{ sha: string }>
  }
  [IpcChannels.EngineInfo]: {
    request: void
    response: EngineResult<EngineInfo>
  }
}
