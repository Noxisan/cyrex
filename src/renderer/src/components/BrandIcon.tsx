import { Cloud } from 'lucide-react'
import type { HostingProviderId } from '@shared/types'

/**
 * Provider brand marks. lucide-react dropped brand icons, so the GitHub, GitLab
 * and Bitbucket marks are inlined as SVG paths here. GitLab keeps its tanuki
 * orange/red and Bitbucket its blue (brand colors, not the UI accent); anything
 * unknown falls back to a neutral cloud glyph.
 */
export function ProviderIcon({
  id,
  size = 16,
  className
}: {
  id: HostingProviderId
  size?: number
  className?: string
}): React.JSX.Element {
  if (id === 'github') {
    return (
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        fill="currentColor"
        aria-hidden
        className={className}
      >
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
      </svg>
    )
  }
  if (id === 'gitlab') {
    return (
      <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden className={className}>
        <path fill="#e24329" d="m8 14.7-2.9-9H10.9z" />
        <path fill="#fc6d26" d="M8 14.7 5.1 5.7H1z" />
        <path fill="#fca326" d="M1 5.7.13 8.4a.6.6 0 0 0 .22.67L8 14.7z" />
        <path fill="#e24329" d="M1 5.7h4.1L3.35.34a.3.3 0 0 0-.57 0z" />
        <path fill="#fc6d26" d="M8 14.7 10.9 5.7H15z" />
        <path fill="#fca326" d="m15 5.7.87 2.7a.6.6 0 0 1-.22.67L8 14.7z" />
        <path fill="#e24329" d="M15 5.7h-4.1l1.75-5.36a.3.3 0 0 1 .57 0z" />
      </svg>
    )
  }
  if (id === 'bitbucket') {
    return (
      <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden className={className}>
        <path
          fill="#2684ff"
          d="M1.5 1.5a.5.5 0 0 0-.5.58l1.97 11.86a.66.66 0 0 0 .64.55h9.46a.49.49 0 0 0 .49-.41l1.97-11.99a.5.5 0 0 0-.5-.58zM9.6 10.2H6.43l-.86-4.48h4.78z"
        />
      </svg>
    )
  }
  return <Cloud size={size} strokeWidth={1.75} className={className} />
}
