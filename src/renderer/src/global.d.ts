/// <reference types="vite-plugin-svgr/client" />

import type { Settings, Staff } from '@app/types'

declare global {
  interface Window {
    staff: {
      list: () => Promise<Staff[]>
      create: (firstName: string, lastName: string) => Promise<Staff>
    }
    settings: {
      get: () => Promise<Settings>
      save: (settings: Settings) => Promise<Settings>
    }
  }
}
