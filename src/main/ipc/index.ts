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
import * as hosting from '../hosting/service'
import { scrubSecrets } from '../git/cli'
import {
  applyPartialSchema,
  cloneSchema,
  hostingConnectTokenSchema,
  hostingCreateRepoSchema,
  hostingDisconnectSchema,
  hostingListReposSchema,
  hostingPollLoginSchema,
  hostingStartLoginSchema,
  setRemoteSchema,
  checkoutRemoteSchema,
  checkoutSchema,
  cherryPickSchema,
  commitDiffSchema,
  commitSchema,
  createBranchSchema,
  createTagSchema,
  deleteBranchSchema,
  tagNameSchema,
  discardSchema,
  fileOpSchema,
  interactiveRebaseSchema,
  lfsPullSchema,
  lfsTrackSchema,
  logSchema,
  mergeBranchSchema,
  mergeSchema,
  pushSchema,
  rebaseBranchSchema,
  rebaseCommitsSchema,
  renameBranchSchema,
  repoPathSchema,
  resetSchema,
  resolveConflictSchema,
  resolveSideSchema,
  revertSchema,
  searchSchema,
  stashIndexSchema,
  stashSaveSchema,
  submoduleAddSchema,
  submoduleSyncSchema,
  submoduleUpdateSchema,
  workingDiffSchema,
  worktreeAddSchema,
  worktreeRemoveSchema
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
    IpcChannels.RepoCreateTag,
    wrap(createTagSchema, async (req) => {
      await engine.createTag(req.path, req.name, req.ref, req.message)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoDeleteTag,
    wrap(tagNameSchema, async (req) => {
      await engine.deleteTag(req.path, req.name)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoPushTag,
    wrap(tagNameSchema, async (req) => {
      await engine.pushTag(req.path, req.name)
      return null
    })
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
    wrap(commitSchema, (req) =>
      engine.commit(req.path, req.message, { amend: req.amend, sign: req.sign })
    )
  )

  ipcMain.handle(
    IpcChannels.RepoCommitContext,
    wrap(repoPathSchema, (req) => engine.commitContext(req.path))
  )

  ipcMain.handle(
    IpcChannels.RepoCheckout,
    wrap(checkoutSchema, async (req) => {
      await engine.checkout(req.path, req.ref)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoCheckoutRemote,
    wrap(checkoutRemoteSchema, async (req) => {
      await engine.checkoutRemote(req.path, req.remoteRef)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoCreateBranch,
    wrap(createBranchSchema, async (req) => {
      await engine.createBranch(req.path, req.name, {
        startPoint: req.startPoint,
        checkout: req.checkout
      })
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoRenameBranch,
    wrap(renameBranchSchema, async (req) => {
      await engine.renameBranch(req.path, req.oldName, req.newName)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoDeleteBranch,
    wrap(deleteBranchSchema, async (req) => {
      await engine.deleteBranch(req.path, req.name, req.force)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoStashList,
    wrap(repoPathSchema, (req) => engine.stashList(req.path))
  )

  ipcMain.handle(
    IpcChannels.RepoStashSave,
    wrap(stashSaveSchema, async (req) => {
      await engine.stashSave(req.path, req.message)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoStashApply,
    wrap(stashIndexSchema, async (req) => {
      await engine.stashApply(req.path, req.index)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoStashPop,
    wrap(stashIndexSchema, async (req) => {
      await engine.stashPop(req.path, req.index)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoStashDrop,
    wrap(stashIndexSchema, async (req) => {
      await engine.stashDrop(req.path, req.index)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoWorktreeList,
    wrap(repoPathSchema, (req) => engine.worktreeList(req.path))
  )

  ipcMain.handle(
    IpcChannels.RepoWorktreeAdd,
    wrap(worktreeAddSchema, (req) =>
      engine.worktreeAdd(req.path, req.parentDir, req.name, req.ref, req.newBranch)
    )
  )

  ipcMain.handle(
    IpcChannels.RepoWorktreeRemove,
    wrap(worktreeRemoveSchema, async (req) => {
      await engine.worktreeRemove(req.path, req.worktreePath, req.force)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoSubmodules,
    wrap(repoPathSchema, (req) => engine.submodules(req.path))
  )

  ipcMain.handle(
    IpcChannels.RepoSubmoduleUpdate,
    wrap(submoduleUpdateSchema, async (req) => {
      await engine.updateSubmodule(req.path, req.subPath, req.init)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoSubmoduleUpdateAll,
    wrap(repoPathSchema, async (req) => {
      await engine.updateAllSubmodules(req.path)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoSubmoduleSync,
    wrap(submoduleSyncSchema, async (req) => {
      await engine.syncSubmodules(req.path, req.subPath)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoSubmoduleAdd,
    wrap(submoduleAddSchema, async (req) => {
      await engine.addSubmodule(req.path, req.url, req.subPath)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoLfsStatus,
    wrap(repoPathSchema, (req) => engine.lfsStatus(req.path))
  )

  ipcMain.handle(
    IpcChannels.RepoLfsPull,
    wrap(lfsPullSchema, async (req) => {
      await engine.lfsPull(req.path, req.file)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoLfsTrack,
    wrap(lfsTrackSchema, async (req) => {
      await engine.lfsTrack(req.path, req.pattern)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoFetch,
    wrap(repoPathSchema, async (req) => {
      await engine.fetch(req.path)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoPull,
    wrap(repoPathSchema, async (req) => {
      await engine.pull(req.path)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoPush,
    wrap(pushSchema, async (req) => {
      await engine.push(req.path, { force: req.force })
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoMerge,
    wrap(mergeSchema, async (req) => {
      await engine.merge(req.path, req.ref)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoMergeBranch,
    wrap(mergeBranchSchema, async (req) => {
      await engine.mergeBranch(req.path, req.source, req.target)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoRebaseBranch,
    wrap(rebaseBranchSchema, async (req) => {
      await engine.rebaseBranch(req.path, req.branch, req.onto)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoCherryPick,
    wrap(cherryPickSchema, async (req) => {
      await engine.cherryPick(req.path, req.sha)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoRevert,
    wrap(revertSchema, async (req) => {
      await engine.revert(req.path, req.sha)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoContinueOp,
    wrap(repoPathSchema, async (req) => {
      await engine.continueOperation(req.path)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoAbortOp,
    wrap(repoPathSchema, async (req) => {
      await engine.abortOperation(req.path)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoRebaseCommits,
    wrap(rebaseCommitsSchema, (req) => engine.rebaseCommits(req.path, req.base))
  )

  ipcMain.handle(
    IpcChannels.RepoInteractiveRebase,
    wrap(interactiveRebaseSchema, (req) =>
      engine.interactiveRebase(req.path, req.base, req.items)
    )
  )

  ipcMain.handle(
    IpcChannels.RepoReadConflict,
    wrap(fileOpSchema, (req) => engine.readConflict(req.path, req.file))
  )

  ipcMain.handle(
    IpcChannels.RepoResolveConflict,
    wrap(resolveConflictSchema, async (req) => {
      await engine.resolveConflict(req.path, req.file, req.content)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoResolveSide,
    wrap(resolveSideSchema, async (req) => {
      await engine.resolveConflictSide(req.path, req.file, req.side)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.RepoFileHistory,
    wrap(fileOpSchema, (req) => engine.fileHistory(req.path, req.file))
  )

  ipcMain.handle(
    IpcChannels.RepoBlame,
    wrap(fileOpSchema, (req) => engine.blame(req.path, req.file))
  )

  ipcMain.handle(
    IpcChannels.RepoSearch,
    wrap(searchSchema, (req) => engine.searchCommits(req.path, req.query))
  )

  ipcMain.handle(
    IpcChannels.RepoReflog,
    wrap(repoPathSchema, (req) => engine.reflog(req.path))
  )

  ipcMain.handle(
    IpcChannels.RepoReset,
    wrap(resetSchema, async (req) => {
      await engine.resetTo(req.path, req.sha, req.mode)
      return null
    })
  )

  // --- directory picker + remote hosting -----------------------------------

  ipcMain.handle(
    IpcChannels.PickDirectory,
    wrap<void, string | null>(null, async () => {
      const win = BrowserWindow.getFocusedWindow()
      const res = await dialog.showOpenDialog(win ?? undefined!, {
        title: 'Choose a folder',
        properties: ['openDirectory', 'createDirectory']
      })
      if (res.canceled || res.filePaths.length === 0) return null
      return res.filePaths[0]
    })
  )

  ipcMain.handle(
    IpcChannels.HostingProviders,
    wrap(null, async () => hosting.providers())
  )

  ipcMain.handle(
    IpcChannels.HostingListAccounts,
    wrap(null, async () => hosting.listAccounts())
  )

  ipcMain.handle(
    IpcChannels.HostingStartLogin,
    wrap(hostingStartLoginSchema, (req) => hosting.startLogin(req.provider))
  )

  ipcMain.handle(
    IpcChannels.HostingPollLogin,
    wrap(hostingPollLoginSchema, (req) => hosting.pollLogin(req.handle))
  )

  ipcMain.handle(
    IpcChannels.HostingConnectToken,
    wrap(hostingConnectTokenSchema, (req) => hosting.connectToken(req.provider, req.token))
  )

  ipcMain.handle(
    IpcChannels.HostingDisconnect,
    wrap(hostingDisconnectSchema, async (req) => {
      hosting.disconnect(req.id)
      return null
    })
  )

  ipcMain.handle(
    IpcChannels.HostingListRepos,
    wrap(hostingListReposSchema, (req) => hosting.listRepos(req.accountId))
  )

  ipcMain.handle(
    IpcChannels.HostingCreateRepo,
    wrap(hostingCreateRepoSchema, (req) =>
      hosting.createRepo(req.accountId, {
        name: req.name,
        description: req.description,
        private: req.private
      })
    )
  )

  ipcMain.handle(
    IpcChannels.RepoClone,
    wrap(cloneSchema, (req) =>
      hosting.cloneRepo(req.cloneUrl, req.parentDir, req.name, req.accountId)
    )
  )

  ipcMain.handle(
    IpcChannels.RepoSetRemote,
    wrap(setRemoteSchema, async (req) => {
      await engine.setOrCreateRemote(req.path, req.url, req.name)
      return null
    })
  )
}
