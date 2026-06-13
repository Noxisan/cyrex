/**
 * Embedded terminal — a pipe-based shell command runner (CLAUDE.md §8).
 *
 * Each entered line is spawned through the user's shell in the session's current
 * directory and its output is streamed back to the renderer's xterm pane. The
 * session tracks `cd` so directory changes persist between commands. This is
 * deliberately NOT a PTY: a real TTY needs `node-pty`, a native module, and this
 * project avoids native modules for the same reasons it uses the git CLI over
 * nodegit. Full TTY/TUI support (prompts, vim, colored isatty output) is the
 * node-pty seam for later; this covers the common "run a command, see output"
 * power-user case with zero native dependencies.
 *
 * Commands are user-initiated and run with the user's real environment so their
 * git/credential setup works as in any terminal. Errors are scrubbed of secrets
 * before they reach the renderer, consistent with the rest of the engine.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ipcMain, type WebContents } from 'electron'
import { z } from 'zod'
import { TerminalChannels } from '@shared/ipc'
import type { TerminalSession } from '@shared/types'
import { scrubSecrets } from '../git/cli'

interface Session {
  id: string
  cwd: string
  child: ChildProcess | null
  sender: WebContents
}

const sessions = new Map<string, Session>()

function send(s: Session, channel: string, payload: unknown): void {
  if (!s.sender.isDestroyed()) s.sender.send(channel, payload)
}

/** Shell + single-command flag for the current platform. */
function shellInvocation(): { cmd: string; flag: string } {
  if (process.platform === 'win32') {
    return { cmd: process.env.ComSpec || 'cmd.exe', flag: '/c' }
  }
  return { cmd: process.env.SHELL || '/bin/bash', flag: '-c' }
}

function createSession(sender: WebContents, cwd: string): TerminalSession {
  const id = randomUUID()
  const start = existsSync(cwd) ? cwd : homedir()
  const session: Session = { id, cwd: start, child: null, sender }
  sessions.set(id, session)
  // Reap the session when its renderer goes away.
  sender.once('destroyed', () => disposeSession(id))
  return { id, cwd: start }
}

function runCommand(sender: WebContents, id: string, line: string): void {
  const s = sessions.get(id)
  if (!s || s.sender !== sender) return
  // One command at a time; the renderer disables input while a command runs.
  if (s.child) return

  const command = line.trim()
  if (command.length === 0) {
    send(s, TerminalChannels.Exit, { id, code: 0, cwd: s.cwd })
    return
  }

  // Intercept a bare `cd` so the directory change persists across commands
  // (each command otherwise runs in its own subprocess).
  const cd = command.match(/^cd(?:\s+(.*))?$/)
  if (cd) {
    const raw = (cd[1] ?? '').trim().replace(/^["']|["']$/g, '')
    const target = raw.length === 0 ? homedir() : raw
    const next = isAbsolute(target) ? target : resolve(s.cwd, target)
    if (existsSync(next) && statSync(next).isDirectory()) {
      s.cwd = next
      send(s, TerminalChannels.Exit, { id, code: 0, cwd: next })
    } else {
      send(s, TerminalChannels.Data, { id, chunk: `cd: no such directory: ${target}\n` })
      send(s, TerminalChannels.Exit, { id, code: 1, cwd: s.cwd })
    }
    return
  }

  const { cmd, flag } = shellInvocation()
  let child: ChildProcess
  try {
    child = spawn(cmd, [flag, command], { cwd: s.cwd, env: process.env, windowsHide: true })
  } catch (err) {
    send(s, TerminalChannels.Data, { id, chunk: `${scrubSecrets((err as Error).message)}\n` })
    send(s, TerminalChannels.Exit, { id, code: 1, cwd: s.cwd })
    return
  }
  s.child = child
  child.stdout?.on('data', (d: Buffer) => send(s, TerminalChannels.Data, { id, chunk: d.toString() }))
  child.stderr?.on('data', (d: Buffer) =>
    send(s, TerminalChannels.Data, { id, chunk: scrubSecrets(d.toString()) })
  )
  child.on('error', (err) =>
    send(s, TerminalChannels.Data, { id, chunk: `${scrubSecrets(err.message)}\n` })
  )
  child.on('close', (code) => {
    s.child = null
    send(s, TerminalChannels.Exit, { id, code: code ?? 0, cwd: s.cwd })
  })
}

/** Interrupt (Ctrl+C) the running command of a session. */
function signalSession(sender: WebContents, id: string): void {
  const s = sessions.get(id)
  if (s?.sender === sender && s.child) s.child.kill('SIGINT')
}

function disposeSession(id: string): void {
  const s = sessions.get(id)
  if (!s) return
  if (s.child) s.child.kill('SIGKILL')
  sessions.delete(id)
}

const createSchema = z.object({ cwd: z.string().min(1) })
const runSchema = z.object({ id: z.string().uuid(), command: z.string().max(100_000) })
const idSchema = z.object({ id: z.string().uuid() })

/** Register the allow-listed terminal IPC handlers. */
export function registerTerminalHandlers(): void {
  ipcMain.handle(TerminalChannels.Create, (e, raw) => {
    const { cwd } = createSchema.parse(raw)
    return createSession(e.sender, cwd)
  })
  ipcMain.handle(TerminalChannels.Run, (e, raw) => {
    const { id, command } = runSchema.parse(raw)
    runCommand(e.sender, id, command)
    return null
  })
  ipcMain.handle(TerminalChannels.Signal, (e, raw) => {
    signalSession(e.sender, idSchema.parse(raw).id)
    return null
  })
  ipcMain.handle(TerminalChannels.Dispose, (_e, raw) => {
    disposeSession(idSchema.parse(raw).id)
    return null
  })
}
