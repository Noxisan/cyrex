/**
 * Provider registry. All three adapters share the same HostingProvider
 * interface; GitHub and GitLab offer OAuth device flow (when a client id is
 * configured) plus token paste, Bitbucket is token paste (app password) only.
 */

import type { HostingProviderId } from '@shared/types'
import type { HostingProvider } from './types'
import { github } from './github'
import { gitlab } from './gitlab'
import { bitbucket } from './bitbucket'

const PROVIDERS: Partial<Record<HostingProviderId, HostingProvider>> = {
  github,
  gitlab,
  bitbucket
}

/** The provider adapter for an id, or throw if it isn't implemented yet. */
export function getProvider(id: HostingProviderId): HostingProvider {
  const p = PROVIDERS[id]
  if (!p) throw new Error(`Provider "${id}" is not available yet.`)
  return p
}

/** Provider ids that have an adapter wired up. */
export function availableProviders(): HostingProviderId[] {
  return Object.keys(PROVIDERS) as HostingProviderId[]
}
