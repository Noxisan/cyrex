/**
 * Conventional Commit helpers (https://www.conventionalcommits.org). Pure
 * functions so the commit composition is easy to reason about and test, kept out
 * of the CommitBox component. This matches the commit style of the Cyrex repo
 * itself (CLAUDE.md §10).
 */

/** The canonical commit types. Kept in English by convention (CLAUDE.md §6). */
export const COMMIT_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore'
] as const

export type CommitType = (typeof COMMIT_TYPES)[number]

export interface ConventionalParts {
  type: CommitType
  scope: string
  breaking: boolean
  /** The free-text message: first line is the subject, the rest is the body. */
  message: string
}

/** Build just the `type(scope)!: subject` header line. */
export function conventionalHeader(parts: Omit<ConventionalParts, 'message'> & {
  subject: string
}): string {
  const scope = parts.scope.trim()
  const scopePart = scope ? `(${scope})` : ''
  return `${parts.type}${scopePart}${parts.breaking ? '!' : ''}: ${parts.subject.trim()}`
}

/**
 * Compose a full Conventional Commit message from the helper fields. The first
 * line of `message` is the subject; any remaining lines become the body,
 * separated from the header by a blank line.
 */
export function composeConventional(parts: ConventionalParts): string {
  const lines = parts.message.split('\n')
  const subject = (lines[0] ?? '').trim()
  const body = lines.slice(1).join('\n').replace(/^\n+/, '').trimEnd()
  const header = conventionalHeader({ ...parts, subject })
  return body ? `${header}\n\n${body}` : header
}
