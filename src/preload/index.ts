import { contextBridge, ipcRenderer } from 'electron';
import type { Settings, Staff } from '@app/types';

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
