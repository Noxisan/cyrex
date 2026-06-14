/**
 * Bitbucket Cloud provider adapter. Bitbucket has no OAuth device flow, so this
 * adapter is token-paste only: the user creates an app password and pastes it as
 * `username:app_password`. That pair is used for HTTP Basic auth here and travels
 * with the stored secret so clone/fetch/push can reconstruct it (see service
 * cloneAuth). The secret never reaches the renderer or logs.
 */

import type { CreateRepoInput, HostingAccount, RemoteRepo } from '@shared/types'
import type { DeviceCode, DevicePoll, HostingProvider } from './types'

const API = 'https://api.bitbucket.org/2.0'

/** `username:app_password` → an HTTP Basic Authorization header value. */
function basic(secret: string): string {
  return `Basic ${Buffer.from(secret).toString('base64')}`
}

/** Authenticated Bitbucket REST call returning parsed JSON, throwing on failure. */
async function api<T>(secret: string, path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `${API}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: basic(secret),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers
    }
  })
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Bitbucket rejected the credentials. Paste them as username:app_password.')
    }
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    const msg = body?.error?.message
    throw new Error(`Bitbucket API error ${res.status}${msg ? `: ${msg}` : ''}`)
  }
  return (await res.json()) as T
}

interface BbRepo {
  uuid: string
  name: string
  full_name: string
  is_private: boolean
  description: string | null
  mainbranch: { name: string } | null
  updated_on: string | null
  links: { html: { href: string } }
}

function toRemoteRepo(r: BbRepo): RemoteRepo {
  const owner = r.full_name.split('/')[0]
  return {
    id: r.uuid,
    name: r.name,
    fullName: r.full_name,
    owner,
    private: r.is_private,
    description: r.description,
    // Build a clean URL rather than trusting links.clone (which may embed a user).
    cloneUrl: `https://bitbucket.org/${r.full_name}.git`,
    htmlUrl: r.links.html.href,
    defaultBranch: r.mainbranch?.name ?? null,
    updatedAt: r.updated_on
  }
}

export const bitbucket: HostingProvider = {
  id: 'bitbucket',

  supportsDeviceFlow() {
    return false
  },

  startDeviceLogin(): Promise<DeviceCode> {
    return Promise.reject(new Error('Bitbucket does not support browser login; use an app password.'))
  },

  pollDeviceLogin(): Promise<DevicePoll> {
    return Promise.reject(new Error('Bitbucket does not support browser login; use an app password.'))
  },

  async validateToken(secret: string): Promise<HostingAccount> {
    const u = await api<{
      username: string
      display_name: string | null
      links: { avatar?: { href: string } }
    }>(secret, '/user')
    return {
      id: `bitbucket:${u.username}`,
      provider: 'bitbucket',
      login: u.username,
      name: u.display_name,
      avatarUrl: u.links.avatar?.href ?? null
    }
  },

  async listRepos(secret: string): Promise<RemoteRepo[]> {
    const out: RemoteRepo[] = []
    let next: string | null = '/repositories?role=member&pagelen=100&sort=-updated_on'
    // Follow Bitbucket's paginated `next` links, capped so it can't spin forever.
    for (let page = 0; page < 10 && next; page++) {
      const body: { values: BbRepo[]; next?: string } = await api<{
        values: BbRepo[]
        next?: string
      }>(secret, next)
      out.push(...body.values.map(toRemoteRepo))
      next = body.next ?? null
    }
    return out
  },

  async createRepo(secret: string, input: CreateRepoInput): Promise<RemoteRepo> {
    // Personal repos live under the user's workspace (slug == username).
    const me = await api<{ username: string }>(secret, '/user')
    const slug = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const r = await api<BbRepo>(secret, `/repositories/${me.username}/${slug}`, {
      method: 'POST',
      body: JSON.stringify({
        scm: 'git',
        is_private: input.private,
        description: input.description ?? ''
      })
    })
    return toRemoteRepo(r)
  }
}
