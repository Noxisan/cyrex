import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, KeyRound, MonitorSmartphone } from 'lucide-react'
import type { HostingProviderId } from '@shared/types'
import { useConnectToken, useProviders } from '../hooks/useHosting'
import { ProviderIcon } from './BrandIcon'

const PROVIDER_LABEL: Record<HostingProviderId, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket'
}

/**
 * Guided account-connect wizard. Pick a provider, then either log in via OAuth
 * device flow (the app shows a code and opens the browser; main polls and saves
 * the token in the keychain) or paste a personal access token. The renderer only
 * ever sees the device user code and the resulting account metadata.
 */
export function ConnectWizard({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: providers } = useProviders()
  const connectToken = useConnectToken()

  const [provider, setProvider] = useState<HostingProviderId | null>(null)
  const [mode, setMode] = useState<'choose' | 'device' | 'token'>('choose')
  const [token, setToken] = useState('')
  const [device, setDevice] = useState<{
    userCode: string
    verificationUri: string
  } | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const cancelled = useRef(false)

  useEffect(() => () => void (cancelled.current = true), [])

  const deviceFlow = (id: HostingProviderId): boolean =>
    providers?.find((p) => p.id === id)?.deviceFlow ?? false

  async function startDevice(id: HostingProviderId): Promise<void> {
    setProvider(id)
    setMode('device')
    setStatus(t('hosting.starting'))
    const res = await window.cyrex.hosting.startLogin(id)
    if (!res.ok) {
      setStatus(res.error)
      return
    }
    setDevice({ userCode: res.data.userCode, verificationUri: res.data.verificationUri })
    setStatus(t('hosting.waiting'))
    let interval = res.data.intervalSec * 1000
    const poll = async (): Promise<void> => {
      if (cancelled.current) return
      const p = await window.cyrex.hosting.pollLogin(res.data.handle)
      if (cancelled.current) return
      if (!p.ok) {
        setStatus(p.error)
        return
      }
      if (p.data.status === 'authorized') {
        void qc.invalidateQueries({ queryKey: ['hostingAccounts'] })
        onClose()
        return
      }
      if (p.data.status === 'expired') return setStatus(t('hosting.expired'))
      if (p.data.status === 'denied') return setStatus(t('hosting.denied'))
      if (p.data.status === 'slowDown') interval += 2000
      setTimeout(poll, interval)
    }
    setTimeout(poll, interval)
  }

  function submitToken(): void {
    if (!provider || !token.trim()) return
    connectToken.mutate(
      { provider, token: token.trim() },
      { onSuccess: () => onClose() }
    )
  }

  // Provider picker
  if (mode === 'choose') {
    return (
      <div>
        <h3 className="mb-3 text-sm font-semibold text-fg">{t('hosting.connectTitle')}</h3>
        <div className="flex flex-col gap-1.5">
          {(providers ?? []).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProvider(p.id)}
              className={`flex items-center gap-2.5 rounded-[var(--radius-card)] border px-3 py-2 text-start text-xs ${
                provider === p.id
                  ? 'border-accent bg-surface-2 text-fg'
                  : 'border-border text-fg-muted hover:bg-surface-2'
              }`}
            >
              <ProviderIcon id={p.id} size={16} />
              <span className="font-medium">{PROVIDER_LABEL[p.id]}</span>
            </button>
          ))}
        </div>

        {provider && (
          <div className="mt-4 flex flex-col gap-1.5">
            {deviceFlow(provider) && (
              <button
                type="button"
                onClick={() => startDevice(provider)}
                className="flex items-center gap-2 rounded-[var(--radius-card)] bg-accent px-3 py-2 text-xs font-medium text-accent-fg hover:bg-accent-hover"
              >
                <MonitorSmartphone size={15} strokeWidth={1.75} />
                {t('hosting.loginBrowser')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setMode('token')}
              className="flex items-center gap-2 rounded-[var(--radius-card)] border border-border px-3 py-2 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <KeyRound size={15} strokeWidth={1.75} />
              {t('hosting.useToken')}
            </button>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-card)] px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    )
  }

  // Device-flow waiting panel
  if (mode === 'device') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setMode('choose')}
          className="mb-3 flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
        >
          <ArrowLeft size={13} /> {t('common.cancel')}
        </button>
        <h3 className="mb-1 text-sm font-semibold text-fg">{t('hosting.loginBrowser')}</h3>
        <p className="mb-3 text-xs text-fg-muted">{t('hosting.deviceHint')}</p>
        {device && (
          <>
            <div className="mb-3 rounded-[var(--radius-card)] border border-border bg-bg px-3 py-3 text-center">
              <div className="font-mono text-xl tracking-[0.3em] text-fg">{device.userCode}</div>
            </div>
            <p className="break-all text-[11px] text-fg-subtle">{device.verificationUri}</p>
          </>
        )}
        {status && <p className="mt-3 text-xs text-fg-muted">{status}</p>}
      </div>
    )
  }

  // Token paste panel
  return (
    <div>
      <button
        type="button"
        onClick={() => setMode('choose')}
        className="mb-3 flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={13} /> {t('common.cancel')}
      </button>
      <h3 className="mb-1 text-sm font-semibold text-fg">
        {t('hosting.tokenTitle', { provider: provider ? PROVIDER_LABEL[provider] : '' })}
      </h3>
      <p className="mb-3 text-xs text-fg-muted">{t('hosting.tokenHint')}</p>
      <input
        autoFocus
        type="password"
        value={token}
        placeholder={t('hosting.tokenPlaceholder')}
        onChange={(e) => setToken(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submitToken()
        }}
        className="mb-4 w-full rounded-[var(--radius-card)] border border-border bg-bg px-2 py-1.5 font-mono text-xs text-fg outline-none focus:border-accent"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setMode('choose')}
          className="rounded-[var(--radius-card)] px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={submitToken}
          disabled={!token.trim() || connectToken.isPending}
          className="rounded-[var(--radius-card)] bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-40"
        >
          {t('hosting.connect')}
        </button>
      </div>
    </div>
  )
}
