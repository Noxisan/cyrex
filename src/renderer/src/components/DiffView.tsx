import { useCommitDiff } from '../hooks/useRepo'
import { DiffPanel } from './DiffPanel'

/** Diff for a selected commit (against its first parent). */
export function DiffView({
  repoPath,
  sha
}: {
  repoPath: string
  sha: string
}): React.JSX.Element {
  const { data, isLoading, error } = useCommitDiff(repoPath, sha)
  return <DiffPanel files={data?.files} isLoading={isLoading} error={error as Error | null} />
}
