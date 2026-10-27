/// <reference types="vite-plugin-svgr/client" />

import type { Settings, Staff } from '@app/types'

declare global {
  interface Window {
    staff: {
      list: () => Promise<Staff[]>
      get: (id: number) => Promise<Staff | null>
      create: (staff: Omit<Staff, 'id'>) => Promise<Staff>
      update: (id: number, staff: Omit<Staff, 'id'>) => Promise<Staff>
      delete: (id: number) => Promise<boolean>
    }
    settings: {
      get: () => Promise<Settings>
      save: (settings: Settings) => Promise<Settings>
    }
  }
}
