export enum Role {
  Nurse,
  Tech,
}

export enum Emp {
  FullTime,
  PartTime,
  PRN,
}

export enum Dept {
  PACU,
  PROC,
  PRE,
}

export interface Staff {
  id: number;
  firstName: string;
  lastName: string;
  title: string;
  role: Role;
  employment: Emp;
  departments: Dept[];
  /* format HH:MM */
  startTime: string;
  isLeader: boolean;
  inOrientation: boolean;
  ipcIds: number[];
}

export interface Settings {
  workingDays: boolean[];
  targetNurses: number;
  targetTechs: number;
  procRooms: number;
  deleteAfter: number;
  isDark: boolean;
}

export type SegmentStep = 'pto' | 'prn' | 'review';

export type SegmentWarning = {
  code:
    | 'DAY_UNDER_TARGET'
    | 'STAFF_SHORT_OF_DAYS'
    | 'IPC_SAME_DAY'
    | 'LEADER_COVERAGE_GAP'
    | 'ONCALL_MULTIPLE';
  message: string;
  date?: string;
  staffId?: number;
};

export type SegmentShift = {
  staffId: number;
  date: string;
  kind: 'work' | 'pto';
  countsTowardTargets: boolean;
};

export interface SegmentState {
  step: SegmentStep;
  startDate: string;
  endDate: string;
  ptoDates: string[];
  prnDates: string[];
  shifts: SegmentShift[];
  onCall: string[];
  staffSnapshot: Staff[];
  settingsSnapshot: Settings;
  seed: number;
  hasManualEdits: boolean;
}

export interface ScheduleSegment {
  id: number;
  startDate: string;
  endDate: string;
  status: 'draft' | 'confirmed';
  createdAt: string;
  state: SegmentState;
}

export interface WeeklyAssignment {
  date: string;
  staffId: number;
  department: Dept;
  room: number | null;
  startTime: string;
}

export interface WeeklySchedule {
  id: number;
  segmentId: number;
  weekStart: string;
  confirmed: boolean;
  assignments: WeeklyAssignment[];
}

export const DEFAULT_SETTINGS: Settings = {
  workingDays: [false, true, true, true, true, true, false],
  targetNurses: 13,
  targetTechs: 5,
  procRooms: 4,
  deleteAfter: 18,
  isDark: false,
};

export const isSettings = (value: unknown): value is Settings => {
  if (typeof value !== 'object' || value === null) return false;

  const settings = value as Record<string, unknown>;
  return (
    Array.isArray(settings.workingDays) &&
    settings.workingDays.length === 7 &&
    settings.workingDays.every((day) => typeof day === 'boolean') &&
    Number.isInteger(settings.targetNurses) &&
    Number.isInteger(settings.targetTechs) &&
    Number.isInteger(settings.procRooms) &&
    Number.isInteger(settings.deleteAfter) &&
    typeof settings.isDark === 'boolean'
  );
};
