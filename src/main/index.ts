import { join } from 'node:path'
import { app, BrowserWindow, Menu, nativeImage, session, shell, Tray } from 'electron'
import appIcon from '../../build/icon.png?asset'
import trayIcon from '../../build/tray.png?asset'
import { registerIpcHandlers } from './ipc'
import { registerTerminalHandlers } from './terminal'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
// Distinguishes "close to tray" from a real quit (set by the tray Quit item).
let isQuitting = false

/**
 * Content-Security-Policy applied to every response. No remote code, no eval.
 * In dev we must allow the Vite client (ws + inline) to run; production is
 * locked down to self only.
 */
function contentSecurityPolicy(): string {
  if (isDev) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self' ws: http://localhost:*"
    ].join('; ')
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'"
  ].join('; ')
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#0e0f12',
    autoHideMenuBar: true,
    // Window / taskbar icon (Linux + Windows; macOS uses the bundle icon).
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Electron security checklist (CLAUDE.md §4):
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  mainWindow = win
  win.once('ready-to-show', () => win.show())

  // Closing the window hides it to the tray instead of quitting; the tray's
  // Quit item (which sets isQuitting) is the way to actually exit.
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })
  win.on('closed', () => {
    mainWindow = null
  })

  // Open all external links in the system browser; never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Block in-page navigation to anywhere that isn't our own app.
  win.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env.ELECTRON_RENDERER_URL
    if (devServer && url.startsWith(devServer)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Bring the main window to the foreground, recreating it if it was closed. */
function showWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/** Create the system-tray icon with a Show/Quit menu. */
function createTray(): void {
  try {
    const image = nativeImage.createFromPath(trayIcon)
    tray = new Tray(image)
    tray.setToolTip('Cyrex')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show Cyrex', click: () => showWindow() },
        { type: 'separator' },
        {
          label: 'Quit Cyrex',
          click: () => {
            isQuitting = true
            app.quit()
          }
        }
      ])
    )
    // Primary click reveals the window (best-effort: not all Linux trays emit it).
    tray.on('click', () => showWindow())
  } catch (err) {
    // A missing StatusNotifier host shouldn't take the app down.
    console.error('Tray unavailable:', err)
  }
}

app.whenReady().then(() => {
  // Apply CSP to every response from the default session.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy()]
      }
    })
  })

  // Refuse all permission requests (camera, geolocation, etc.) — Cyrex needs none.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, deny) => deny(false))

  registerIpcHandlers()
  registerTerminalHandlers()
  createWindow()
  createTray()

  app.on('activate', () => showWindow())
})

// The app lives in the tray, so closing the last window does not quit (except
// on macOS, which keeps apps running without windows by convention anyway).
app.on('window-all-closed', () => {
  /* intentionally no-op: quit happens via the tray's Quit item */
})

app.on('before-quit', () => {
  isQuitting = true
})
