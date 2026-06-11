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
  [IpcChannels.EngineInfo]: {
    request: void
    response: EngineResult<EngineInfo>
  }
}
