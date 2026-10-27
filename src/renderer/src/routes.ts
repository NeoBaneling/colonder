import { createHashRouter } from 'react-router';
import App from './App';
import GeneratorPage from './generator/Generator';
import SchedulesPage from './schedules/Schedules';
import SettingsPage from './settings/Settings';
import StaffPage from './staff/Staff';
import StaffForm from './staff/StaffForm';

export const router = createHashRouter([
  {
    path: '/',
    Component: App,
    children: [
      { index: true, Component: SchedulesPage },
      { path: 'schedules', Component: SchedulesPage },
      { path: 'new', Component: GeneratorPage },
      {
        path: 'staff',
        children: [
          {
            index: true,
            Component: StaffPage,
          },
          {
            path: ':staffId',
            Component: StaffForm,
          },
        ],
      },
      { path: 'settings', Component: SettingsPage },
    ],
  },
]);
