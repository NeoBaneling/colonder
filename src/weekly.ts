import {
  Dept,
  type ScheduleSegment,
  type SegmentState,
  type WeeklyAssignment,
} from './types';

export type SegmentWeek = {
  start: string;
  end: string;
  dates: string[];
};

const nextDate = (date: string): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};

export const getSegmentWeeks = (segment: ScheduleSegment): SegmentWeek[] => {
  const dates: string[] = [];
  const settings = segment.state.settingsSnapshot;
  for (
    let date = segment.startDate;
    date <= segment.endDate;
    date = nextDate(date)
  ) {
    if (settings.workingDays[new Date(`${date}T00:00:00.000Z`).getUTCDay()]) {
      dates.push(date);
    }
  }

  const weeks: SegmentWeek[] = [];
  for (let index = 0; index < dates.length; index += 5) {
    const days = dates.slice(index, index + 5);
    weeks.push({ start: days[0], end: days[days.length - 1], dates: days });
  }
  return weeks;
};

export const getChangedWeekStarts = (
  segment: ScheduleSegment,
  updatedState: SegmentState,
): string[] => {
  const changedDates = new Set<string>();
  const getWorkingKeys = (state: SegmentState, date: string) =>
    state.shifts
      .filter(
        (shift) =>
          shift.date === date &&
          shift.kind === 'work',
      )
      .map((shift) => shift.staffId)
      .sort((a, b) => a - b)
      .join(',');

  for (const week of getSegmentWeeks(segment)) {
    if (
      week.dates.some(
        (date) =>
          getWorkingKeys(segment.state, date) !==
          getWorkingKeys(updatedState, date),
      )
    ) {
      changedDates.add(week.start);
    }
  }
  return [...changedDates];
};

export const generateWeeklyAssignments = (
  segment: ScheduleSegment,
  dates: string[],
): WeeklyAssignment[] => {
  const settings = segment.state.settingsSnapshot;
  const staffById = new Map(
    segment.state.staffSnapshot.map((person) => [person.id, person]),
  );
  const assignments: WeeklyAssignment[] = [];

  for (const [dateIndex, date] of dates.entries()) {
    const assignedStaff = new Set<number>();
    const dayStaff = segment.state.shifts
      .filter((shift) => shift.date === date && shift.kind === 'work')
      .filter((shift) => {
        if (assignedStaff.has(shift.staffId)) return false;
        assignedStaff.add(shift.staffId);
        return true;
      })
      .map((shift) => staffById.get(shift.staffId))
      .filter((person) => person !== undefined)
      .sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName) ||
          a.firstName.localeCompare(b.firstName) ||
          a.id - b.id,
      );
    const roomLoads = new Map<number, number>(
      Array.from({ length: settings.procRooms }, (_, index) => [index + 1, 0]),
    );
    const departmentLoads = new Map<Dept, number>([
      [Dept.PRE, 0],
      [Dept.PACU, 0],
    ]);

    const remaining = new Set(dayStaff);
    const assignToRoom = (
      person: (typeof dayStaff)[number],
      underfilledOnly = false,
    ) => {
      const room = [...roomLoads.entries()].sort(
        ([roomA, loadA], [roomB, loadB]) =>
          Number(underfilledOnly && loadA >= 2) -
            Number(underfilledOnly && loadB >= 2) ||
          loadA - loadB ||
          roomA - roomB,
      )[0]?.[0];
      if (room === undefined) return false;
      if (underfilledOnly && (roomLoads.get(room) ?? 0) >= 2) return false;
      roomLoads.set(room, (roomLoads.get(room) ?? 0) + 1);
      assignments.push({
        date,
        staffId: person.id,
        department: Dept.PROC,
        room,
        startTime: person.startTime,
      });
      return true;
    };

    for (const person of dayStaff) {
      if (person.departments.length !== 1) continue;
      const [department] = person.departments;
      if (department === Dept.PROC) {
        assignToRoom(person);
      } else {
        departmentLoads.set(
          department,
          (departmentLoads.get(department) ?? 0) + 1,
        );
        assignments.push({
          date,
          staffId: person.id,
          department,
          room: null,
          startTime: person.startTime,
        });
      }
      remaining.delete(person);
    }

    const procCandidates = [...remaining].filter((person) =>
      person.departments.includes(Dept.PROC),
    );
    for (const person of procCandidates) {
      if (
        settings.procRooms === 0 ||
        [...roomLoads.values()].every((load) => load >= 2)
      ) {
        break;
      }
      if (assignToRoom(person, true)) remaining.delete(person);
    }

    for (const person of remaining) {
      const eligibleDepartments = person.departments
        .filter((department) => department === Dept.PRE || department === Dept.PACU)
        .sort((a, b) => a - b);
      if (eligibleDepartments.length === 0) {
        if (settings.procRooms > 0) assignToRoom(person);
        continue;
      }

      const minimumLoad = Math.min(
        ...eligibleDepartments.map(
          (department) => departmentLoads.get(department) ?? 0,
        ),
      );
      const leastLoaded = eligibleDepartments.filter(
        (department) => departmentLoads.get(department) === minimumLoad,
      );
      const department =
        leastLoaded[(person.id + dateIndex) % leastLoaded.length];
      departmentLoads.set(department, minimumLoad + 1);
      assignments.push({
        date,
        staffId: person.id,
        department,
        room: null,
        startTime: person.startTime,
      });
    }
  }

  return assignments;
};
