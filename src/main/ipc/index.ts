/**
 * Registers all IPC handlers. Each handler:
 *   1. validates its payload with zod (schemas.ts),
 *   2. calls the Git engine,
 *   3. returns a uniform EngineResult envelope (never throws across IPC),
 *   4. scrubs error text so credentials never reach the renderer or logs.
 */

import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { ZodType } from 'zod'
import { IpcChannels } from '@shared/ipc'
import type { EngineResult, RepoRef } from '@shared/types'
import * as engine from '../git/engine'
import { scrubSecrets } from '../git/cli'
import {
  applyPartialSchema,
  commitDiffSchema,
  commitSchema,
  discardSchema,
  fileOpSchema,
  logSchema,
  repoPathSchema,
  workingDiffSchema
} from './schemas'

/** Wrap an async handler so it always returns EngineResult and never throws. */
function wrap<TReq, TRes>(
  schema: ZodType<TReq> | null,
  fn: (req: TReq) => Promise<TRes>
): (_e: unknown, raw: unknown) => Promise<EngineResult<TRes>> {
  return async (_e, raw) => {
    try {
      const req = schema ? schema.parse(raw) : (undefined as TReq)
      const data = await fn(req)
      return { ok: true, data }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: scrubSecrets(message) }
    }
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(
    IpcChannels.EngineInfo,
    wrap(null, () => engine.getEngineInfo())
  )

  ipcMain.handle(
    IpcChannels.RepoOpenDialog,
    wrap<void, RepoRef | null>(null, async () => {
      const win = BrowserWindow.getFocusedWindow()
      const res = await dialog.showOpenDialog(win ?? undefined!, {
        title: 'Open Repository',
        properties: ['openDirectory']
      })
      if (res.canceled || res.filePaths.length === 0) return null
      return engine.openRepo(res.filePaths[0])
    })
  )

  ipcMain.handle(
    IpcChannels.RepoOpen,
    wrap(repoPathSchema, (req) => engine.openRepo(req.path))
  )

  ipcMain.handle(
    IpcChannels.RepoStatus,
    wrap(repoPathSchema, (req) => engine.status(req.path))
  )

  ipcMain.handle(
    IpcChannels.RepoLog,
    wrap(logSchema, (req) => engine.log(req.path, req.options))
  )

  ipcMain.handle(
    IpcChannels.RepoBranches,
    wrap(repoPathSchema, (req) => engine.branches(req.path))
  )

  ipcMain.handle(
    IpcChannels.RepoTags,
    wrap(repoPathSchema, (req) => engine.tags(req.path))
  )

  ipcMain.handle(
    IpcChannels.RepoCommitDiff,
    wrap(commitDiffSchema, (req) => engine.commitDiff(req.path, req.sha))
  )

  ipcMain.handle(
    IpcChannels.RepoWorkingDiff,
    wrap(workingDiffSchema, (req) =>
      engine.workingDiff(req.path, {
        file: req.file,
        staged: req.staged,
        untracked: req.untracked
      })
    )
  )

  ipcMain.handle(
    IpcChannels.RepoStage,
    wrap(fileOpSchema, async (req) => {
      await engine.stage(req.path, req.file)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoUnstage,
    wrap(fileOpSchema, async (req) => {
      await engine.unstage(req.path, req.file)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoApplyPartial,
    wrap(applyPartialSchema, async (req) => {
      await engine.applyPartial(req.path, {
        file: req.file,
        hunkIndex: req.hunkIndex,
        lines: req.lines,
        op: req.op
      })
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoDiscard,
    wrap(discardSchema, async (req) => {
      await engine.discard(req.path, req.file, req.untracked)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoCommit,
    wrap(commitSchema, (req) => engine.commit(req.path, req.message))
  )
}
