import {
  Dept,
  Emp,
  Role,
  type SegmentShift,
  type SegmentWarning,
  type Settings,
  type Staff,
} from '../../../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export const dayOfWeek = (date: string): number =>
  new Date(`${date}T00:00:00.000Z`).getUTCDay();

export const nextWorkingStart = (
  workingDays: boolean[],
  confirmedEndDates: string[],
  today = new Date().toISOString().slice(0, 10),
): string => {
  const firstDay = workingDays.findIndex(Boolean);
  if (firstDay < 0) return '';

  const latestConfirmedEnd = confirmedEndDates.reduce(
    (latest, date) => (date > latest ? date : latest),
    '',
  );
  let date = addDays(latestConfirmedEnd || today, 1);
  for (let index = 0; index < 14; index += 1) {
    if (dayOfWeek(date) === firstDay) return date;
    date = addDays(date, 1);
  }
  return '';
};

export const dayLabel = (date: string): string =>
  DAY_LABELS[dayOfWeek(date)];

export const segmentEndDate = (
  startDate: string,
  workingDays: boolean[],
): string => {
  if (!workingDays.some(Boolean)) return '';
  let date = addDays(startDate, 41);
  while (!workingDays[dayOfWeek(date)]) date = addDays(date, -1);
  return date;
};

export const getSegmentDates = (
  startDate: string,
  workingDays: boolean[],
): string[] =>
  Array.from({ length: 42 }, (_, index) => addDays(startDate, index)).filter(
    (date) => workingDays[dayOfWeek(date)],
  );

export const cellKey = (staffId: number, date: string): string =>
  `${staffId}:${date}`;

const isWorking = (shifts: SegmentShift[], staffId: number, date: string) =>
  shifts.some(
    (shift) =>
      shift.staffId === staffId && shift.date === date && shift.kind === 'work',
  );

export const weekIndex = (startDate: string, date: string): number =>
  Math.floor(
    (new Date(`${date}T00:00:00.000Z`).getTime() -
      new Date(`${startDate}T00:00:00.000Z`).getTime()) /
      (7 * DAY_MS),
  );

export const generateSegmentShifts = (
  staff: Staff[],
  dates: string[],
  ptoDates: string[],
  prnDates: string[],
  startDate: string,
  seed: number,
): SegmentShift[] => {
  const pto = new Set(ptoDates);
  const prn = new Set(prnDates);
  const shifts: SegmentShift[] = [];

  for (const staffer of staff) {
    for (const date of dates) {
      if (pto.has(cellKey(staffer.id, date))) {
        shifts.push({
          staffId: staffer.id,
          date,
          kind: 'pto',
          countsTowardTargets: false,
        });
      }
    }
  }

  const weekGroups = new Map<number, string[]>();
  for (const date of dates) {
    const week = weekIndex(startDate, date);
    weekGroups.set(week, [...(weekGroups.get(week) ?? []), date]);
  }

  for (const [week, weekDates] of weekGroups) {
    const orderedStaff = [...staff].sort((a, b) => {
      const aOrder = (a.id * 31 + seed + week * 17) % 997;
      const bOrder = (b.id * 31 + seed + week * 17) % 997;
      return aOrder - bOrder;
    });

    for (const staffer of orderedStaff) {
      const availableDates = weekDates.filter(
        (date) => !pto.has(cellKey(staffer.id, date)),
      );

      if (staffer.employment === Emp.PRN) {
        for (const date of availableDates) {
          if (prn.has(cellKey(staffer.id, date))) {
            shifts.push({
              staffId: staffer.id,
              date,
              kind: 'work',
              countsTowardTargets: false,
            });
          }
        }
        continue;
      }

      const desiredDays =
        staffer.employment === Emp.FullTime ? 4 : 3;
      const selectedDates = [...availableDates]
        .sort((a, b) => {
          const count = (date: string) =>
            shifts.filter(
              (shift) =>
                shift.date === date &&
                shift.kind === 'work' &&
                shift.countsTowardTargets &&
                staff.find((member) => member.id === shift.staffId)?.role ===
                  staffer.role,
            ).length;
          const diff = count(a) - count(b);
          if (diff !== 0) return diff;
          const ipcCount = (date: string) =>
            shifts.filter(
              (shift) =>
                shift.date === date &&
                shift.kind === 'work' &&
                staffer.ipcIds.includes(shift.staffId),
            ).length;
          const ipcDiff = ipcCount(a) - ipcCount(b);
          if (ipcDiff !== 0) return ipcDiff;
          return (
            ((Date.parse(`${a}T00:00:00.000Z`) / DAY_MS + staffer.id + seed) %
              weekDates.length) -
            ((Date.parse(`${b}T00:00:00.000Z`) / DAY_MS + staffer.id + seed) %
              weekDates.length)
          );
        })
        .slice(0, desiredDays);

      for (const date of selectedDates) {
        shifts.push({
          staffId: staffer.id,
          date,
          kind: 'work',
          countsTowardTargets: !staffer.inOrientation,
        });
      }
    }
  }

  return shifts;
};

export const validateSegment = (
  staff: Staff[],
  dates: string[],
  shifts: SegmentShift[],
  settings: Settings,
  onCall: string[] = [],
  startDate = dates[0] ?? '',
): SegmentWarning[] => {
  const warnings: SegmentWarning[] = [];
  const staffById = new Map(staff.map((person) => [person.id, person]));

  for (const date of dates) {
    const dayShifts = shifts.filter(
      (shift) => shift.date === date && shift.kind === 'work',
    );
    const nurses = dayShifts.filter(
      (shift) =>
        shift.countsTowardTargets &&
        staffById.get(shift.staffId)?.role === Role.Nurse,
    ).length;
    const techs = dayShifts.filter(
      (shift) =>
        shift.countsTowardTargets &&
        staffById.get(shift.staffId)?.role === Role.Tech,
    ).length;

    if (nurses < settings.targetNurses || techs < settings.targetTechs) {
      warnings.push({
        code: 'DAY_UNDER_TARGET',
        date,
        message: `${dayLabel(date)} ${date}: ${nurses}/${settings.targetNurses} nurses, ${techs}/${settings.targetTechs} techs`,
      });
    }

    const workingIds = new Set(dayShifts.map(({ staffId }) => staffId));
    for (const person of staff) {
      if (!workingIds.has(person.id)) continue;
      for (const conflictId of person.ipcIds) {
        if (conflictId > person.id && workingIds.has(conflictId)) {
          const conflict = staffById.get(conflictId);
          warnings.push({
            code: 'IPC_SAME_DAY',
            date,
            staffId: person.id,
            message: `${person.firstName} ${person.lastName} and ${conflict?.firstName ?? 'a conflicting staff member'} work on ${date}.`,
          });
        }
      }
    }

    const departments = [Dept.PACU, Dept.PROC, Dept.PRE];
    for (const department of departments) {
      const hasLeader = dayShifts.some((shift) => {
        const person = staffById.get(shift.staffId);
        return (
          person?.isLeader &&
          !person.inOrientation &&
          person.departments.includes(department)
        );
      });
      const departmentHasLeader = staff.some(
        (person) =>
          person.isLeader &&
          !person.inOrientation &&
          person.departments.includes(department),
      );
      if (departmentHasLeader && !hasLeader) {
        warnings.push({
          code: 'LEADER_COVERAGE_GAP',
          date,
          message: `No qualified leader is working in ${department} on ${date}.`,
        });
      }
    }
  }

  const groupedDates = new Map<number, string[]>();
  for (const date of dates) {
    const week = weekIndex(startDate, date);
    groupedDates.set(week, [...(groupedDates.get(week) ?? []), date]);
  }
  for (const [week, weekDates] of groupedDates) {
    for (const person of staff) {
      if (person.employment === Emp.PRN) continue;
      const desired =
        person.employment === Emp.FullTime ? 4 : 3;
      const available = weekDates.filter(
        (date) =>
          !shifts.some(
            (shift) =>
              shift.staffId === person.id &&
              shift.date === date &&
              shift.kind === 'pto',
          ),
      );
      const worked = weekDates.filter((date) =>
        isWorking(shifts, person.id, date),
      );
      if (available.length < desired && worked.length < desired) {
        warnings.push({
          code: 'STAFF_SHORT_OF_DAYS',
          staffId: person.id,
          date: weekDates[0],
          message: `${person.firstName} ${person.lastName} can work only ${available.length} of ${desired} requested days in week ${week + 1}.`,
        });
      }

      const onCallDays = onCall
        .map((key) => {
          const separator = key.indexOf(':');
          return {
            staffId: Number(key.slice(0, separator)),
            date: key.slice(separator + 1),
          };
        })
        .filter(
          (entry) =>
            entry.staffId === person.id &&
            weekDates.includes(entry.date),
        );
      if (onCallDays.length > 1) {
        warnings.push({
          code: 'ONCALL_MULTIPLE',
          staffId: person.id,
          date: onCallDays[1].date,
          message: `${person.firstName} ${person.lastName} has more than one on-call shift in week ${week + 1}.`,
        });
      }
    }
  }

  return warnings;
};

export const dailyCounts = (
  date: string,
  staff: Staff[],
  shifts: SegmentShift[],
) => {
  const members = new Map(staff.map((person) => [person.id, person]));
  const working = shifts.filter(
    (shift) =>
      shift.date === date && shift.kind === 'work' && shift.countsTowardTargets,
  );
  return {
    nurses: working.filter(
      ({ staffId }) => members.get(staffId)?.role === Role.Nurse,
    ).length,
    techs: working.filter(
      ({ staffId }) => members.get(staffId)?.role === Role.Tech,
    ).length,
  };
};
