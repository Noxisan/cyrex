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
 * Assign each commit a lane, then connect lanes with edges.
 *
 * `lanes[i]` reserves the sha that lane i is currently waiting to reach. A
 * commit takes the lane(s) reserved for it (freeing them — this is what the old
 * version failed to do, leaking a new lane per branch), seats its first parent
 * in the same lane to keep history straight, and gives extra parents their own
 * lanes. Lanes a parent already occupies are reused so merges converge rather
 * than spawning duplicates.
 */
export function computeLayout(commits: Commit[]): GraphLayout {
  const rowOf = new Map<string, number>()
  commits.forEach((c, i) => rowOf.set(c.sha, i))

  const laneOf = new Map<string, number>()
  const lanes: (string | null)[] = []
  let maxLane = 0

  const firstFree = (): number => {
    const f = lanes.indexOf(null)
    if (f !== -1) return f
    lanes.push(null)
    return lanes.length - 1
  }
  const reserve = (sha: string): number => {
    const existing = lanes.indexOf(sha)
    if (existing !== -1) return existing
    const lane = firstFree()
    lanes[lane] = sha
    return lane
  }

  // Pass 1 — lane assignment (newest -> oldest, i.e. input order).
  for (const commit of commits) {
    let my = lanes.indexOf(commit.sha)
    if (my === -1) my = firstFree() // a tip: nothing downstream reserved it
    laneOf.set(commit.sha, my)
    maxLane = Math.max(maxLane, my)

    // Free every lane that was waiting for this commit (converging merges).
    for (let i = 0; i < lanes.length; i++) if (lanes[i] === commit.sha) lanes[i] = null

    commit.parents.forEach((parent, idx) => {
      if (!rowOf.has(parent)) return
      if (lanes.indexOf(parent) !== -1) return // already reserved by another child
      const lane = idx === 0 && lanes[my] === null ? ((lanes[my] = parent), my) : reserve(parent)
      maxLane = Math.max(maxLane, lane)
    })
  }

  // Pass 2 — nodes and edges from the finalized lane assignment.
  const nodes: GraphNode[] = commits.map((c, row) => ({
    sha: c.sha,
    row,
    lane: laneOf.get(c.sha) ?? 0,
    parents: c.parents
  }))

  const edges: GraphEdge[] = []
  for (const commit of commits) {
    const fromRow = rowOf.get(commit.sha)!
    const fromLane = laneOf.get(commit.sha)!
    for (const parent of commit.parents) {
      if (!rowOf.has(parent)) continue
      edges.push({
        fromRow,
        toRow: rowOf.get(parent)!,
        fromLane,
        toLane: laneOf.get(parent)!
      })
    }
  }

  return { nodes, edges, laneCount: maxLane + 1 }
}
