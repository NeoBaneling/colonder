import { describe, expect, it } from 'vitest';
import { Dept, Emp, Role, type SegmentShift, type Staff } from '../../../types';
import { getSegmentDates } from './engine';
import {
  getAutoOnCallSchedule,
  isOnCallEligible,
  isWeekendOnCallEligible,
  onCallTarget,
} from './onCall';

const staffMember = (
  id: number,
  employment: Emp,
  departments: Dept[],
  overrides: Partial<Staff> = {},
): Staff => ({
  id,
  firstName: `Staff${id}`,
  lastName: 'Member',
  title: 'RN',
  role: Role.Nurse,
  employment,
  departments,
  startTime: '07:00',
  isLeader: false,
  inOrientation: false,
  ipcIds: [],
  ...overrides,
});

describe('on-call schedule helpers', () => {
  const startDate = '2026-10-05';
  const dates = getSegmentDates(startDate, [
    false,
    true,
    true,
    true,
    true,
    true,
    false,
  ]);
  const shiftsFor = (people: Staff[]): SegmentShift[] =>
    people.flatMap((person) =>
      dates.map((date) => ({
        staffId: person.id,
        date,
        kind: 'work' as const,
        countsTowardTargets: true,
      })),
    );

  it('applies five full-time and three part-time weekday assignments over six weeks', () => {
    const fullTime = staffMember(1, Emp.FullTime, [Dept.PACU, Dept.PROC]);
    const partTime = staffMember(2, Emp.PartTime, [Dept.PROC]);
    const assignments = getAutoOnCallSchedule(
      [fullTime, partTime],
      dates,
      shiftsFor([fullTime, partTime]),
      startDate,
    );
    const countFor = (id: number) =>
      assignments.onCall.filter((key) => key.startsWith(`${id}:`)).length +
      assignments.weekendOnCall.filter((entry) => entry.staffId === id).length *
        2;

    expect(countFor(fullTime.id)).toBe(5);
    expect(countFor(partTime.id)).toBe(3);
    expect(onCallTarget(Emp.FullTime)).toBe(5);
    expect(onCallTarget(Emp.PartTime)).toBe(3);
  });

  it('covers both PACU and PROC once each day when staffing capacity allows', () => {
    const pacuStaff = Array.from({ length: 6 }, (_, index) =>
      staffMember(index + 1, Emp.FullTime, [Dept.PACU]),
    );
    const procStaff = Array.from({ length: 6 }, (_, index) =>
      staffMember(index + 7, Emp.FullTime, [Dept.PROC]),
    );
    const people = [...pacuStaff, ...procStaff];
    const assignments = getAutoOnCallSchedule(
      people,
      dates,
      shiftsFor(people),
      startDate,
    );

    for (const date of dates) {
      const dailyAssignments = assignments.onCall
        .filter((key) => key.endsWith(`:${date}`))
        .map((key) => assignments.onCallDepartments[key]);
      expect(dailyAssignments).toContain(Dept.PACU);
      expect(dailyAssignments).toContain(Dept.PROC);
      expect(dailyAssignments).toHaveLength(2);
    }
    for (const person of people) {
      expect(
        assignments.onCall.filter((key) => key.startsWith(`${person.id}:`)),
      ).toHaveLength(5);
    }
  });

  it('counts one weekend as two days toward the part-time target', () => {
    const partTime = staffMember(
      1,
      Emp.PartTime,
      [Dept.PACU, Dept.PROC],
    );
    const assignments = getAutoOnCallSchedule(
      [partTime],
      dates,
      shiftsFor([partTime]),
      startDate,
    );
    const weekendAssignments = assignments.weekendOnCall.filter(
      (entry) => entry.staffId === partTime.id,
    ).length;
    const weekdayAssignments = assignments.onCall.filter((key) =>
      key.startsWith(`${partTime.id}:`),
    ).length;

    expect(weekendAssignments).toBe(1);
    expect(weekdayAssignments).toBe(1);
    expect(weekendAssignments * 2 + weekdayAssignments).toBe(
      onCallTarget(Emp.PartTime),
    );
  });

  it('assigns a trained department, balances dual-trained calls, and excludes ineligible staff', () => {
    const pacuOnly = staffMember(1, Emp.FullTime, [Dept.PACU]);
    const procOnly = staffMember(2, Emp.FullTime, [Dept.PROC]);
    const dualTrained = staffMember(3, Emp.FullTime, [Dept.PACU, Dept.PROC]);
    const orientation = staffMember(4, Emp.FullTime, [Dept.PACU], {
      inOrientation: true,
    });
    const untrained = staffMember(5, Emp.FullTime, [Dept.PRE]);
    const prn = staffMember(6, Emp.PRN, [Dept.PACU, Dept.PROC]);
    const people = [pacuOnly, procOnly, dualTrained, orientation, untrained, prn];
    const assignments = getAutoOnCallSchedule(
      people,
      dates,
      shiftsFor(people),
      startDate,
    );

    expect(isOnCallEligible(pacuOnly)).toBe(true);
    expect(isOnCallEligible(orientation)).toBe(false);
    expect(isOnCallEligible(untrained)).toBe(false);
    expect(isOnCallEligible(prn)).toBe(false);
    expect(isWeekendOnCallEligible(pacuOnly)).toBe(false);
    expect(isWeekendOnCallEligible(dualTrained)).toBe(true);
    const pacuKey = assignments.onCall.find((key) =>
      key.startsWith(`${pacuOnly.id}:`),
    )!;
    const procKey = assignments.onCall.find((key) =>
      key.startsWith(`${procOnly.id}:`),
    )!;
    expect(assignments.onCallDepartments[pacuKey]).toBe(Dept.PACU);
    expect(assignments.onCallDepartments[procKey]).toBe(Dept.PROC);

    const dualCalls = assignments.onCall
      .filter((key) => key.startsWith(`${dualTrained.id}:`))
      .map((key) => assignments.onCallDepartments[key]);
    expect(dualCalls).toHaveLength(1);
    expect(
      assignments.onCall.some((key) => key.startsWith(`${orientation.id}:`)),
    ).toBe(false);
    expect(
      assignments.onCall.some((key) => key.startsWith(`${untrained.id}:`)),
    ).toBe(false);
    expect(assignments.weekendOnCall).toHaveLength(6);
    expect(
      assignments.weekendOnCall.filter(
        (assignment) => assignment.staffId === dualTrained.id,
      ),
    ).toHaveLength(2);
    expect(
      assignments.onCall.filter((key) =>
        key.startsWith(`${dualTrained.id}:`),
      ).length +
        assignments.weekendOnCall.filter(
          (assignment) => assignment.staffId === dualTrained.id,
        ).length *
          2,
    ).toBe(5);
    expect(
      assignments.onCall.filter((key) =>
        key.startsWith(`${dualTrained.id}:`),
      ),
    ).toHaveLength(1);
  });

  it('does not assign OC on a date without a generated work shift', () => {
    const person = staffMember(1, Emp.FullTime, [Dept.PACU]);
    const shifts = shiftsFor([person]).filter(
      (shift) => shift.date !== dates[0],
    );
    const assignments = getAutoOnCallSchedule(
      [person],
      dates,
      shifts,
      startDate,
    );

    expect(assignments.onCall).not.toContain(`${person.id}:${dates[0]}`);
    expect(assignments.onCall).toHaveLength(5);
  });
});
