/**
 * Commit-graph computation, main-process side (CLAUDE.md §5 structure).
 *
 * For now this re-exports the pure layout in @shared/graph, which the renderer
 * runs directly for small/medium histories. When repos get large enough that
 * laying out thousands of commits would jank the renderer, move the call here
 * and expose it over IPC so the work happens off the UI thread — the function
 * signature is identical, so nothing else changes.
 */

import { computeLayout } from '@shared/graph'
import type { Commit } from '@shared/types'
import type { GraphLayout } from '@shared/graph'

export function buildGraphLayout(commits: Commit[]): GraphLayout {
  return computeLayout(commits)
}
