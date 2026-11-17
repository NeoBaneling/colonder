import { Dept, Emp, type SegmentShift, type Staff } from '../../../types';
import { cellKey, weekIndex } from './engine';

export type WeekendOnCall = {
  weekStart: string;
  staffId: number | null;
};

export type AutoOnCallSchedule = {
  onCall: string[];
  onCallDepartments: Record<string, Dept>;
  weekendOnCall: WeekendOnCall[];
};

export const isOnCallEligible = (person: Staff): boolean =>
  !person.inOrientation &&
  person.employment !== Emp.PRN &&
  (person.departments.includes(Dept.PACU) ||
    person.departments.includes(Dept.PROC));

export const isWeekendOnCallEligible = (person: Staff): boolean =>
  isOnCallEligible(person) &&
  person.departments.includes(Dept.PACU) &&
  person.departments.includes(Dept.PROC);

export const onCallTarget = (employment: Emp): number =>
  employment === Emp.FullTime ? 5 : employment === Emp.PartTime ? 3 : 0;

export const getAutoOnCallSchedule = (
  staff: Staff[],
  dates: string[],
  shifts: SegmentShift[],
  startDate: string,
): AutoOnCallSchedule => {
  const groupedDates = new Map<number, string[]>();
  for (const date of dates) {
    const week = weekIndex(startDate, date);
    groupedDates.set(week, [...(groupedDates.get(week) ?? []), date]);
  }
  const weeks = [...groupedDates.values()];
  const workKeys = new Set(
    shifts
      .filter((shift) => shift.kind === 'work')
      .map((shift) => cellKey(shift.staffId, shift.date)),
  );
  const onCall: string[] = [];
  const onCallDepartments: Record<string, Dept> = {};
  const orderedStaff = [...staff]
    .filter(isOnCallEligible)
    .sort((a, b) => a.id - b.id);
  const targets = new Map(
    orderedStaff.map((person) => [person.id, onCallTarget(person.employment)]),
  );
  const datesByPerson = new Map<number, Set<string>>();
  const weeksByPerson = new Map<number, Set<number>>();
  const departmentCounts = new Map<number, Record<Dept.PACU | Dept.PROC, number>>();
  const weekendStaff = orderedStaff.filter(isWeekendOnCallEligible);
  const weekendCounts = new Map<number, number>();
  const weekendOnCall = weeks.map((weekDates, index) => {
    const availableStaff = weekendStaff
      .filter(
        (person) =>
            (weekendCounts.get(person.id) ?? 0) +
              (datesByPerson.get(person.id)?.size ?? 0) +
              2 <=
              (targets.get(person.id) ?? 0),
      )
      .sort((a, b) => {
        const aTarget = targets.get(a.id) ?? 1;
        const bTarget = targets.get(b.id) ?? 1;
        const aRatio =
          ((weekendCounts.get(a.id) ?? 0) +
            (datesByPerson.get(a.id)?.size ?? 0)) /
          aTarget;
        const bRatio =
          ((weekendCounts.get(b.id) ?? 0) +
            (datesByPerson.get(b.id)?.size ?? 0)) /
          bTarget;
        return (
          aRatio - bRatio ||
          ((a.id * 31 + index * 17) % 997) -
            ((b.id * 31 + index * 17) % 997)
        );
      });
    const person = availableStaff[0];
    if (person) {
      weekendCounts.set(person.id, (weekendCounts.get(person.id) ?? 0) + 2);
    }
    return {
      weekStart: weekDates[0],
      staffId: person?.id ?? null,
    };
  });

  const assign = (
    person: Staff,
    date: string,
    department: Dept.PACU | Dept.PROC,
  ) => {
    const key = cellKey(person.id, date);
    onCall.push(key);
    onCallDepartments[key] = department;
    const assignedDates = datesByPerson.get(person.id) ?? new Set<string>();
    assignedDates.add(date);
    datesByPerson.set(person.id, assignedDates);
    const assignedWeeks = weeksByPerson.get(person.id) ?? new Set<number>();
    assignedWeeks.add(weekIndex(startDate, date));
    weeksByPerson.set(person.id, assignedWeeks);
    const counts = departmentCounts.get(person.id) ?? {
      [Dept.PACU]: 0,
      [Dept.PROC]: 0,
    };
    counts[department] += 1;
    departmentCounts.set(person.id, counts);
  };

  const choosePerson = (
    date: string,
    department: Dept.PACU | Dept.PROC,
  ): Staff | undefined =>
    orderedStaff
      .filter((person) => {
        const target = targets.get(person.id) ?? 0;
        const assignedDates = datesByPerson.get(person.id);
        const totalAssigned =
          (assignedDates?.size ?? 0) + (weekendCounts.get(person.id) ?? 0);
        return (
          target > totalAssigned &&
          !assignedDates?.has(date) &&
          workKeys.has(cellKey(person.id, date)) &&
          person.departments.includes(department)
        );
      })
      .sort((a, b) => {
        const aCount = datesByPerson.get(a.id)?.size ?? 0;
        const bCount = datesByPerson.get(b.id)?.size ?? 0;
        const balance =
          aCount / (targets.get(a.id) ?? 1) -
          bCount / (targets.get(b.id) ?? 1);
        if (balance !== 0) return balance;
        const currentWeek = weekIndex(startDate, date);
        const aWeek = weeksByPerson.get(a.id)?.has(currentWeek) ? 1 : 0;
        const bWeek = weeksByPerson.get(b.id)?.has(currentWeek) ? 1 : 0;
        return (
          aWeek - bWeek ||
          ((a.id * 31 + currentWeek * 17) % 997) -
            ((b.id * 31 + currentWeek * 17) % 997)
        );
      })[0];

  for (const date of dates) {
    for (const department of [Dept.PACU, Dept.PROC] as const) {
      const person = choosePerson(date, department);
      if (person) assign(person, date, department);
    }
  }

  for (const person of orderedStaff) {
    const target = targets.get(person.id) ?? 0;
    const availableDates = dates
      .filter(
        (date) =>
          workKeys.has(cellKey(person.id, date)) &&
          !datesByPerson.get(person.id)?.has(date),
      )
      .sort((a, b) => a.localeCompare(b));
    while (
      (datesByPerson.get(person.id)?.size ?? 0) +
        (weekendCounts.get(person.id) ?? 0) <
      target
    ) {
      const assignedWeeks = weeksByPerson.get(person.id) ?? new Set<number>();
      const date =
        availableDates.find(
          (candidate) =>
            !assignedWeeks.has(weekIndex(startDate, candidate)),
        ) ?? availableDates[0];
      if (!date) break;

      const counts = departmentCounts.get(person.id) ?? {
        [Dept.PACU]: 0,
        [Dept.PROC]: 0,
      };
      const canPacu = person.departments.includes(Dept.PACU);
      const canProc = person.departments.includes(Dept.PROC);
      const department =
        canPacu && canProc
          ? counts[Dept.PACU] <= counts[Dept.PROC]
            ? Dept.PACU
            : Dept.PROC
          : canPacu
            ? Dept.PACU
            : Dept.PROC;
      assign(person, date, department);
      availableDates.splice(availableDates.indexOf(date), 1);
    }
  }

  return { onCall, onCallDepartments, weekendOnCall };
};
