import { contextBridge, ipcRenderer } from 'electron';
import type {
  ScheduleSegment,
  SegmentState,
  Settings,
  Staff,
  WeeklyAssignment,
  WeeklySchedule,
} from '@app/types';

contextBridge.exposeInMainWorld('staff', {
  list: (): Promise<Staff[]> => ipcRenderer.invoke('staff:list'),
  get: (id: number): Promise<Staff | null> =>
    ipcRenderer.invoke('staff:get', id),
  create: (staff: Omit<Staff, 'id'>): Promise<Staff> =>
    ipcRenderer.invoke('staff:create', staff),
  update: (id: number, staff: Omit<Staff, 'id'>): Promise<Staff> =>
    ipcRenderer.invoke('staff:update', id, staff),
  delete: (id: number): Promise<boolean> =>
    ipcRenderer.invoke('staff:delete', id),
});

contextBridge.exposeInMainWorld('settings', {
  get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  save: (settings: Settings): Promise<Settings> =>
    ipcRenderer.invoke('settings:save', settings),
});

contextBridge.exposeInMainWorld('segments', {
  list: (): Promise<ScheduleSegment[]> => ipcRenderer.invoke('segments:list'),
  create: (
    state: SegmentState,
  ): Promise<ScheduleSegment> => ipcRenderer.invoke('segments:create', state),
  saveDraft: (
    id: number,
    state: SegmentState,
  ): Promise<ScheduleSegment> =>
    ipcRenderer.invoke('segments:save-draft', id, state),
  confirm: (
    id: number,
    state: SegmentState,
  ): Promise<ScheduleSegment> =>
    ipcRenderer.invoke('segments:confirm', id, state),
  updateConfirmed: (
    id: number,
    state: SegmentState,
  ): Promise<ScheduleSegment> =>
    ipcRenderer.invoke('segments:update-confirmed', id, state),
  deleteDraft: (id: number): Promise<boolean> =>
    ipcRenderer.invoke('segments:delete-draft', id),
});

contextBridge.exposeInMainWorld('schedules', {
  downloadPdf: (filename: string): Promise<{ canceled: boolean }> =>
    ipcRenderer.invoke('schedules:download-pdf', filename),
});

contextBridge.exposeInMainWorld('weeklySchedules', {
  listForSegment: (segmentId: number): Promise<WeeklySchedule[]> =>
    ipcRenderer.invoke('weekly-schedules:list', segmentId),
  getOrCreate: (segmentId: number, weekStart: string): Promise<WeeklySchedule> =>
    ipcRenderer.invoke('weekly-schedules:get-or-create', segmentId, weekStart),
  save: (
    id: number,
    assignments: WeeklyAssignment[],
    confirmed: boolean,
  ): Promise<WeeklySchedule> =>
    ipcRenderer.invoke('weekly-schedules:save', id, assignments, confirmed),
});
