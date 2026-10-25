import { createHashRouter } from 'react-router';
import App from './App';
import GeneratorPage from './generator/Generator';
import SchedulesPage from './schedules/Schedules';
import SettingsPage from './settings/Settings';
import StaffPage from './staff/Staff';

export const router = createHashRouter([
  {
    path: '/',
    Component: App,
    children: [
      { index: true, Component: SchedulesPage },
      { path: 'schedules', Component: SchedulesPage },
      { path: 'new', Component: GeneratorPage },
      { path: 'staff', Component: StaffPage },
      { path: 'settings', Component: SettingsPage },
    ],
  },
]);
