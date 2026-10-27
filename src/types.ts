export interface Staff {
  id: number;
  firstName: string;
  lastName: string;
}

export interface Settings {
  workingDays: boolean[];
  targetNurses: number;
  targetTechs: number;
  procRooms: number;
  deleteAfter: number;
  isDark: boolean;
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
