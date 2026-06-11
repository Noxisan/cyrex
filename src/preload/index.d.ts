import type { CyrexApi } from './index'

declare global {
  interface Window {
    cyrex: CyrexApi
  }
}

export {}
