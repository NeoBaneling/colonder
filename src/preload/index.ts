import { contextBridge, ipcRenderer } from 'electron';
import type { Staff } from '@app/types';

contextBridge.exposeInMainWorld('staff', {
  list: (): Promise<Staff[]> => ipcRenderer.invoke('staff:list'),
  create: (firstName: string, lastName: string): Promise<Staff> =>
    ipcRenderer.invoke('staff:create', firstName, lastName),
});
