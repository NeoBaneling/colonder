import { createHashRouter } from 'react-router';
import App from './App';
import GeneratorPage from './generator/Generator';
import HistoryDetailsPage from './schedules/HistoryDetails';
import SchedulesPage from './schedules/Schedules';
import WeeklyDetailPage from './schedules/WeeklyDetail';
import WeeklySchedulePage from './schedules/WeeklySchedule';
import SettingsPage from './settings/Settings';
import StaffPage from './staff/Staff';
import StaffForm from './staff/StaffForm';
import Dashboard from './dashboard/Dashboard';

export const router = createHashRouter([
  {
    path: '/',
    Component: App,
    children: [
      { index: true, Component: Dashboard },
      { path: 'schedules', Component: SchedulesPage },
      { path: 'schedules/:scheduleId', Component: HistoryDetailsPage },
      { path: 'schedules/:scheduleId/edit', Component: GeneratorPage },
      {
        path: 'schedules/:scheduleId/weekly/:weekStart',
        Component: WeeklyDetailPage,
      },
      { path: 'new', Component: GeneratorPage },
      { path: 'weekly', Component: WeeklySchedulePage },
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
