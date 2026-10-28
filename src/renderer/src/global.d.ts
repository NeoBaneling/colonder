/// <reference types="vite-plugin-svgr/client" />

import type {
  ScheduleSegment,
  SegmentState,
  Settings,
  Staff,
} from '@app/types'

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
    segments: {
      list: () => Promise<ScheduleSegment[]>
      create: (state: SegmentState) => Promise<ScheduleSegment>
      saveDraft: (id: number, state: SegmentState) => Promise<ScheduleSegment>
      confirm: (id: number, state: SegmentState) => Promise<ScheduleSegment>
      deleteDraft: (id: number) => Promise<boolean>
    }
  }
}
