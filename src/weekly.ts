import {
  Dept,
  Role,
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

const dateAfter = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export const getCalendarWeekRange = (
  date: string,
): { start: string; end: string } => {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const start = dateAfter(date, -day);
  return { start, end: dateAfter(start, 6) };
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

export const getSegmentCalendarRange = (
  segment: ScheduleSegment,
): { start: string; end: string } | null => {
  const weeks = getSegmentWeeks(segment);
  if (weeks.length === 0) return null;
  return {
    start: getCalendarWeekRange(weeks[0].start).start,
    end: getCalendarWeekRange(weeks[weeks.length - 1].end).end,
  };
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

  for (const date of dates) {
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
      .filter(
        (person) =>
          !person.preferredWorkingDays?.some(Boolean) ||
          person.preferredWorkingDays[new Date(`${date}T00:00:00.000Z`).getUTCDay()],
      )
      .sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName) ||
          a.firstName.localeCompare(b.firstName) ||
          a.id - b.id,
      );
    const chargeStaff = dayStaff.filter(
      (person) => person.role === Role.ChargeNurse,
    );
    for (const person of chargeStaff) {
      assignments.push({
        date,
        staffId: person.id,
        department: 'CHARGE',
        room: null,
        startTime: person.startTime,
      });
    }
    const departmentStaff = dayStaff.filter(
      (person) => person.role !== Role.ChargeNurse,
    );
    const remaining = new Set(departmentStaff);
    const procRooms = new Map(
      Array.from({ length: settings.procRooms }, (_, index) => [
        index + 1,
        [] as (typeof departmentStaff)[number][],
      ]),
    );
    const departmentLoads = new Map<Dept, number>([
      [Dept.PRE, 0],
      [Dept.PACU, 0],
    ]);

    const assign = (
      person: (typeof departmentStaff)[number],
      department: Dept,
      room: number | null = null,
    ) => {
      if (!remaining.delete(person)) return false;
      if (department === Dept.PROC && room !== null) {
        procRooms.get(room)?.push(person);
      } else {
        departmentLoads.set(
          department,
          (departmentLoads.get(department) ?? 0) + 1,
        );
      }
      assignments.push({
        date,
        staffId: person.id,
        department,
        room,
        startTime: person.startTime,
      });
      return true;
    };

    const chooseProcRoom = (
      person: (typeof departmentStaff)[number],
      allowOccupiedRole = false,
    ): number | undefined =>
      [...procRooms.entries()]
        .filter(
          ([, members]) =>
            members.length < 2 + Number(person.inOrientation) &&
            (allowOccupiedRole ||
              !members.some((member) => member.role === person.role)),
        )
        .sort(
          ([roomA, membersA], [roomB, membersB]) =>
            Number(membersA.some((member) => member.role === person.role)) -
              Number(membersB.some((member) => member.role === person.role)) ||
            membersA.length - membersB.length ||
            roomA - roomB,
        )[0]?.[0];

    const assignProcCandidate = (
      person: (typeof departmentStaff)[number],
      allowOccupiedRole = false,
    ) => {
      const room = chooseProcRoom(person, allowOccupiedRole);
      return room === undefined
        ? false
        : assign(person, Dept.PROC, room);
    };

    const onCallKeys = new Set(segment.state.onCall);
    for (const person of departmentStaff) {
      const key = `${person.id}:${date}`;
      if (!onCallKeys.has(key)) continue;
      const requestedDepartment = segment.state.onCallDepartments?.[key];
      const department =
        requestedDepartment !== undefined &&
        person.departments.includes(requestedDepartment)
          ? requestedDepartment
          : [Dept.PACU, Dept.PROC, Dept.PRE].find((candidate) =>
              person.departments.includes(candidate),
            );
      if (department === undefined) continue;
      if (department === Dept.PROC) {
        assignProcCandidate(person, true);
      } else {
        assign(person, department);
      }
    }

    const chooseCandidate = (
      department: Dept,
      role: Role.Nurse | Role.Tech,
      preferredStartTime: string,
      room?: number,
    ) =>
      [...remaining]
        .filter(
          (person) =>
            person.role === role &&
            !person.inOrientation &&
            person.departments.includes(department) &&
            (department !== Dept.PROC ||
              room === undefined ||
              !procRooms
                .get(room)
                ?.some((member) => member.role === person.role)),
        )
        .sort(
          (a, b) =>
            Number(b.startTime === preferredStartTime) -
              Number(a.startTime === preferredStartTime) ||
            Number(b.departments.length === 1) -
              Number(a.departments.length === 1) ||
            a.lastName.localeCompare(b.lastName) ||
            a.firstName.localeCompare(b.firstName) ||
            a.id - b.id,
        )[0];

    for (const [room] of procRooms) {
      for (const role of [Role.Nurse, Role.Tech]) {
        const person = chooseCandidate(Dept.PROC, role, '07:00', room);
        if (person) assign(person, Dept.PROC, room);
      }
    }

    const departmentTargets: Array<{
      department: Dept.PRE | Dept.PACU;
      role: Role.Nurse | Role.Tech;
      startTime: string;
    }> = [
      ...Array.from({ length: 3 }, () => ({
        department: Dept.PRE as const,
        role: Role.Nurse as const,
        startTime: '06:00',
      })),
      {
        department: Dept.PRE,
        role: Role.Nurse,
        startTime: '07:00',
      },
      {
        department: Dept.PRE,
        role: Role.Tech,
        startTime: '07:00',
      },
      ...Array.from({ length: 5 }, () => ({
        department: Dept.PACU as const,
        role: Role.Nurse as const,
        startTime: '08:00',
      })),
      {
        department: Dept.PACU,
        role: Role.Tech,
        startTime: '08:00',
      },
    ];
    const remainingTargets = [...departmentTargets];
    while (remainingTargets.length > 0) {
      const availableTargets = remainingTargets
        .map((target, index) => {
          const targetCount = departmentTargets.filter(
            (candidate) =>
              candidate.department === target.department &&
              candidate.role === target.role,
          ).length;
          const assignedCount = assignments.filter((assignment) => {
            const person = staffById.get(assignment.staffId);
            return (
              assignment.date === date &&
              assignment.department === target.department &&
              person?.role === target.role
            );
          }).length;
          return {
            target,
            index,
            assignedCount,
            targetCount,
            person:
              assignedCount < targetCount
                ? chooseCandidate(
                    target.department,
                    target.role,
                    target.startTime,
                  )
                : undefined,
          };
        })
        .filter((entry) => entry.person !== undefined)
        .sort(
          (a, b) =>
            a.assignedCount / a.targetCount -
              b.assignedCount / b.targetCount ||
            a.index - b.index,
        );
      const next = availableTargets[0];
      if (!next?.person) break;
      assign(next.person, next.target.department);
      remainingTargets.splice(next.index, 1);
    }

    for (const person of [...remaining]) {
      if (!person.inOrientation) continue;
      const buddyDepartment = person.departments.find((department) => {
        if (department === Dept.PROC) {
          return [...procRooms.values()].some(
            (members) =>
              members.length < 3 &&
              members.some(
                (member) =>
                  member.role === person.role && !member.inOrientation,
              ),
          );
        }
        return assignments.some((assignment) => {
          const buddy = staffById.get(assignment.staffId);
          return (
            assignment.date === date &&
            assignment.department === department &&
            buddy?.role === person.role &&
            !buddy.inOrientation
          );
        });
      });
      if (buddyDepartment === Dept.PROC) {
        const room = [...procRooms.entries()].find(
          ([, members]) =>
            members.length < 3 &&
            members.some(
              (member) => member.role === person.role && !member.inOrientation,
            ),
        )?.[0];
        if (room !== undefined) assign(person, Dept.PROC, room);
      } else if (buddyDepartment !== undefined) {
        assign(person, buddyDepartment);
      }
    }

    for (const person of [...remaining]) {
      const eligibleDepartments = person.departments
        .filter((department) =>
          [Dept.PRE, Dept.PACU, Dept.PROC].includes(department),
        )
        .sort((a, b) => a - b);
      const singleDepartment = eligibleDepartments.length === 1;
      const choices = singleDepartment
        ? eligibleDepartments
        : eligibleDepartments.sort(
            (a, b) =>
              (a === Dept.PROC
                ? [...procRooms.values()].reduce(
                    (total, members) =>
                      total + Number(members.some((member) => member.role === person.role)),
                    0,
                  )
                : departmentLoads.get(a) ?? 0) -
              (b === Dept.PROC
                ? [...procRooms.values()].reduce(
                    (total, members) =>
                      total + Number(members.some((member) => member.role === person.role)),
                    0,
                  )
                : departmentLoads.get(b) ?? 0),
          );
      for (const department of choices) {
        const assigned =
          department === Dept.PROC
            ? assignProcCandidate(person)
            : assign(person, department);
        if (assigned) break;
      }
    }
  }

  return assignments;
};
