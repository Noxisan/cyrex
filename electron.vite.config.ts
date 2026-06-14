import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// App version, read from package.json and inlined into the renderer at build
// time (see __APP_VERSION__ in vite-env.d.ts) so the UI can show it without IPC.
const appVersion = JSON.parse(readFileSync(resolve('package.json'), 'utf-8')).version as string

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    // Public OAuth client ids for device-flow login (no secret). Empty unless
    // the owner sets CYREX_{GITHUB,GITLAB}_CLIENT_ID — then token paste is used.
    define: {
      __GITHUB_CLIENT_ID__: JSON.stringify(process.env.CYREX_GITHUB_CLIENT_ID ?? ''),
      __GITLAB_CLIENT_ID__: JSON.stringify(process.env.CYREX_GITLAB_CLIENT_ID ?? '')
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        // Sandboxed preloads must be CommonJS (.js), not ESM. main/index.ts
        // loads `../preload/index.js`, so pin the format + extension here.
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion)
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') }
      }
    }
  }
})
