/**
 * Hosting orchestration (main process). Ties provider adapters to the token
 * vault and manages OAuth device-login sessions. This is the only place that
 * holds a raw token in memory transiently; nothing here returns a token to the
 * caller — only account/repo metadata and login status.
 */

import { randomUUID } from 'node:crypto'
import { shell } from 'electron'
import type {
  CreateRepoInput,
  DeviceLoginStart,
  DeviceLoginStatus,
  HostingAccount,
  HostingProviderId,
  RemoteRepo,
  RepoRef
} from '@shared/types'
import * as credentials from '../credentials'
import * as engine from '../git/engine'
import { availableProviders, getProvider } from './index'

interface LoginSession {
  provider: HostingProviderId
  deviceCode: string
  expiresAt: number
}

const sessions = new Map<string, LoginSession>()

export interface ProviderInfo {
  id: HostingProviderId
  deviceFlow: boolean
}

/** Wired providers and whether each offers device-flow login right now. */
export function providers(): ProviderInfo[] {
  return availableProviders().map((id) => ({ id, deviceFlow: getProvider(id).supportsDeviceFlow() }))
}

export function listAccounts(): HostingAccount[] {
  return credentials.listAccounts()
}

export function disconnect(id: string): void {
  credentials.deleteAccount(id)
}

/** Start device-flow login: shows a code and opens the provider's verify page. */
export async function startLogin(providerId: HostingProviderId): Promise<DeviceLoginStart> {
  const provider = getProvider(providerId)
  if (!provider.supportsDeviceFlow()) {
    throw new Error('This provider is not set up for browser login; use a token instead.')
  }
  const code = await provider.startDeviceLogin()
  const handle = randomUUID()
  sessions.set(handle, {
    provider: providerId,
    deviceCode: code.deviceCode,
    expiresAt: Date.now() + code.expiresInSec * 1000
  })
  void shell.openExternal(code.verificationUri)
  return {
    handle,
    userCode: code.userCode,
    verificationUri: code.verificationUri,
    intervalSec: code.intervalSec
  }
}

/** Poll a device-login once. On success the account is saved and returned. */
export async function pollLogin(handle: string): Promise<DeviceLoginStatus> {
  const session = sessions.get(handle)
  if (!session) return { status: 'expired' }
  if (Date.now() > session.expiresAt) {
    sessions.delete(handle)
    return { status: 'expired' }
  }
  const provider = getProvider(session.provider)
  const poll = await provider.pollDeviceLogin(session.deviceCode)
  if (poll.status === 'authorized') {
    sessions.delete(handle)
    const account = await provider.validateToken(poll.token)
    credentials.saveAccount(account, poll.token)
    return { status: 'authorized', account }
  }
  if (poll.status === 'expired' || poll.status === 'denied') sessions.delete(handle)
  return poll
}

/** Token-paste path: validate, save, and return the account. */
export async function connectToken(
  providerId: HostingProviderId,
  token: string
): Promise<HostingAccount> {
  const account = await getProvider(providerId).validateToken(token)
  credentials.saveAccount(account, token)
  return account
}

function tokenFor(accountId: string): string {
  const token = credentials.getToken(accountId)
  if (!token) throw new Error('That account is no longer connected. Reconnect it and try again.')
  return token
}

function providerOf(accountId: string): HostingProviderId {
  return accountId.split(':')[0] as HostingProviderId
}

export function listRepos(accountId: string): Promise<RemoteRepo[]> {
  return getProvider(providerOf(accountId)).listRepos(tokenFor(accountId))
}

export function createRepo(accountId: string, input: CreateRepoInput): Promise<RemoteRepo> {
  return getProvider(providerOf(accountId)).createRepo(tokenFor(accountId), input)
}

/**
 * Map a provider's stored secret to git HTTPS credentials. GitHub uses a fixed
 * `x-access-token` user, GitLab `oauth2`, and Bitbucket the `username:app_password`
 * pair the user pasted (so the username travels with the secret).
 */
function cloneAuth(accountId: string, secret: string): engine.CloneAuth {
  const provider = providerOf(accountId)
  if (provider === 'bitbucket') {
    const i = secret.indexOf(':')
    if (i > 0) return { username: secret.slice(0, i), password: secret.slice(i + 1) }
    return { username: accountId.split(':')[1] ?? 'x-token-auth', password: secret }
  }
  if (provider === 'gitlab') return { username: 'oauth2', password: secret }
  return { username: 'x-access-token', password: secret }
}

/** Clone a repo, resolving the account's token in-process (never via IPC). */
export function cloneRepo(
  cloneUrl: string,
  parentDir: string,
  name: string,
  accountId?: string
): Promise<RepoRef> {
  const secret = accountId ? credentials.getToken(accountId) : null
  const auth = accountId && secret ? cloneAuth(accountId, secret) : undefined
  return engine.cloneRepo(cloneUrl, parentDir, name, auth)
}
