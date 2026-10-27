import { contextBridge, ipcRenderer } from 'electron';
import type { Settings, Staff } from '@app/types';

contextBridge.exposeInMainWorld('staff', {
  list: (): Promise<Staff[]> => ipcRenderer.invoke('staff:list'),
  create: (firstName: string, lastName: string): Promise<Staff> =>
    ipcRenderer.invoke('staff:create', firstName, lastName),
});

contextBridge.exposeInMainWorld('settings', {
  get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  save: (settings: Settings): Promise<Settings> =>
    ipcRenderer.invoke('settings:save', settings),
});
