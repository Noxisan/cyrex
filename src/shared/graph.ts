/**
 * Commit-graph lane layout — the data behind Cyrex's signature graph view.
 *
 * Pure and dependency-free so it can run in the renderer for small histories
 * today and be moved wholesale into the main process (src/main/git/graph.ts)
 * for large repos without rewriting it. Input is the commit list in topological
 * (newest-first) order as returned by the engine.
 */

import type { Commit } from './types'

export interface GraphNode {
  sha: string
  /** Row index (0 = newest, matches input order). */
  row: number
  /** Horizontal lane this commit occupies. */
  lane: number
  parents: string[]
}

export interface GraphEdge {
  fromRow: number
  toRow: number
  fromLane: number
  toLane: number
}

export interface GraphLayout {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Total number of lanes used — drives the graph column width. */
  laneCount: number
}

/**
 * Assign each commit to a lane using a simple first-fit algorithm over a set of
 * "active lanes" keyed by the sha each lane is currently waiting to reach.
 */
export function computeLayout(commits: Commit[]): GraphLayout {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const rowOf = new Map<string, number>()
  commits.forEach((c, i) => rowOf.set(c.sha, i))

  // activeLanes[lane] = sha that lane is currently reserved for (or null/free).
  const activeLanes: (string | null)[] = []
  let laneCount = 0

  const claimLane = (sha: string): number => {
    const existing = activeLanes.indexOf(sha)
    if (existing !== -1) return existing
    const free = activeLanes.indexOf(null)
    if (free !== -1) {
      activeLanes[free] = sha
      return free
    }
    activeLanes.push(sha)
    return activeLanes.length - 1
  }

  commits.forEach((commit, row) => {
    const lane = claimLane(commit.sha)
    laneCount = Math.max(laneCount, activeLanes.length)
    nodes.push({ sha: commit.sha, row, lane, parents: commit.parents })

    // This lane is consumed by this commit; free it before re-seating parents.
    activeLanes[lane] = null

    commit.parents.forEach((parent, idx) => {
      // Only draw/seat parents that are within the loaded window.
      if (!rowOf.has(parent)) return
      const parentLane =
        idx === 0
          ? ((): number => {
              // First parent inherits this lane when possible (straight line).
              if (activeLanes[lane] === null) {
                activeLanes[lane] = parent
                return lane
              }
              return claimLane(parent)
            })()
          : claimLane(parent)
      edges.push({
        fromRow: row,
        toRow: rowOf.get(parent)!,
        fromLane: lane,
        toLane: parentLane
      })
    })
  })

  return { nodes, edges, laneCount: Math.max(laneCount, 1) }
}
