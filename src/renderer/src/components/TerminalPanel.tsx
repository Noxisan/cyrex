import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { TerminalSquare, X } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { ITheme } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useRepoStore } from '../store/repoStore'

/** Build an xterm theme from the app's current CSS variables. */
function xtermTheme(): ITheme {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string): string => cs.getPropertyValue(n).trim()
  return {
    background: v('--color-surface'),
    foreground: v('--color-fg'),
    cursor: v('--color-accent'),
    cursorAccent: v('--color-surface'),
    selectionBackground: v('--color-surface-2'),
    black: '#1c1f26',
    red: v('--color-danger'),
    green: v('--color-diff-add'),
    yellow: v('--color-conflict'),
    blue: v('--color-lane-1'),
    magenta: v('--color-lane-4'),
    cyan: v('--color-lane-5'),
    white: v('--color-fg'),
    brightBlack: v('--color-fg-subtle')
  }
}

export function TerminalPanel(): React.JSX.Element | null {
  const { t } = useTranslation()
  const open = useRepoStore((s) => s.terminalOpen)
  const activePath = useRepoStore((s) => s.activePath)
  const toggleTerminal = useRepoStore((s) => s.toggleTerminal)
  const theme = useRepoStore((s) => s.theme)
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)

  // Build (and tear down) the terminal + its shell session for the active repo.
  useEffect(() => {
    if (!open || !activePath || !hostRef.current) return

    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 12,
      cursorBlink: true,
      theme: xtermTheme()
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    fit.fit()
    termRef.current = term

    // Per-session state kept in a closure to avoid stale React captures.
    const st = { id: '', cwd: activePath, buf: '', running: false, hist: [] as string[], hidx: 0 }

    const shortCwd = (): string => {
      const parts = st.cwd.split('/').filter(Boolean)
      return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : st.cwd
    }
    const promptText = (): string =>
      `\x1b[38;2;247;55;79mcyrex\x1b[0m \x1b[38;2;107;114;128m${shortCwd()}\x1b[0m $ `
    const writePrompt = (): void => term.write(`\r\n${promptText()}`)
    const redraw = (next: string): void => {
      term.write(`\r\x1b[2K${promptText()}${next}`)
      st.buf = next
    }

    term.writeln(t('terminal.intro'))

    void window.cyrex.terminal.create(activePath).then((s) => {
      st.id = s.id
      st.cwd = s.cwd
      writePrompt()
    })

    const offData = window.cyrex.terminal.onData((d) => {
      if (d.id !== st.id) return
      // xterm needs CRLF; shells emit LF.
      term.write(d.chunk.replace(/\r?\n/g, '\r\n'))
    })
    const offExit = window.cyrex.terminal.onExit((e) => {
      if (e.id !== st.id) return
      st.cwd = e.cwd
      st.running = false
      writePrompt()
    })

    const submit = (): void => {
      const line = st.buf
      st.buf = ''
      term.write('\r\n')
      if (line.trim()) st.hist.push(line)
      st.hidx = st.hist.length
      st.running = true
      void window.cyrex.terminal.run(st.id, line)
    }

    term.onData((data) => {
      if (st.running) {
        if (data === '\x03') void window.cyrex.terminal.signal(st.id) // Ctrl+C
        return
      }
      if (data === '\x1b[A') {
        if (st.hist.length > 0) {
          st.hidx = Math.max(0, st.hidx - 1)
          redraw(st.hist[st.hidx] ?? '')
        }
        return
      }
      if (data === '\x1b[B') {
        if (st.hist.length > 0) {
          st.hidx = Math.min(st.hist.length, st.hidx + 1)
          redraw(st.hist[st.hidx] ?? '')
        }
        return
      }
      if (data === '\x03') {
        term.write('^C')
        st.buf = ''
        writePrompt()
        return
      }
      for (const ch of data) {
        if (ch === '\r' || ch === '\n') {
          submit()
          break
        } else if (ch === '\x7f') {
          if (st.buf.length > 0) {
            st.buf = st.buf.slice(0, -1)
            term.write('\b \b')
          }
        } else if (ch >= ' ') {
          st.buf += ch
          term.write(ch)
        }
      }
    })

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* host detached mid-resize */
      }
    })
    ro.observe(hostRef.current)

    return () => {
      ro.disconnect()
      offData()
      offExit()
      if (st.id) void window.cyrex.terminal.dispose(st.id)
      term.dispose()
      termRef.current = null
    }
  }, [open, activePath, t])

  // Re-theme in place when the app theme changes.
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = xtermTheme()
  }, [theme])

  if (!open || !activePath) return null

  return (
    <div className="flex h-72 shrink-0 flex-col border-t border-border bg-surface">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3 text-xs text-fg-muted">
        <TerminalSquare size={14} strokeWidth={1.75} />
        <span className="font-medium uppercase tracking-wide">{t('terminal.title')}</span>
        <span className="truncate text-fg-subtle">{t('terminal.hint')}</span>
        <button
          type="button"
          onClick={toggleTerminal}
          className="ms-auto shrink-0 text-fg-subtle hover:text-fg"
          aria-label={t('common.cancel')}
        >
          <X size={15} />
        </button>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden px-2 py-1" />
    </div>
  )
}
