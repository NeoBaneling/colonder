import { describe, expect, it } from 'vitest';
import { Dept, Emp, Role, type ScheduleSegment, type Staff } from './types';
import {
  generateWeeklyAssignments,
  getChangedWeekStarts,
  getSegmentWeeks,
} from './weekly';

const staffMember = (id: number, departments: Dept[]): Staff => ({
  id,
  firstName: `Staff${id}`,
  lastName: 'Member',
  title: 'RN',
  role: Role.Nurse,
  employment: Emp.FullTime,
  departments,
  startTime: '07:00',
  isLeader: false,
  inOrientation: false,
  ipcIds: [],
});

const segment: ScheduleSegment = {
  id: 1,
  startDate: '2026-10-05',
  endDate: '2026-11-13',
  status: 'confirmed',
  createdAt: '2026-10-01',
  state: {
    step: 'review',
    startDate: '2026-10-05',
    endDate: '2026-11-13',
    ptoDates: [],
    prnDates: [],
    shifts: [
      { staffId: 1, date: '2026-10-05', kind: 'work', countsTowardTargets: true },
      { staffId: 2, date: '2026-10-05', kind: 'work', countsTowardTargets: true },
      { staffId: 3, date: '2026-10-05', kind: 'work', countsTowardTargets: true },
      { staffId: 1, date: '2026-10-06', kind: 'pto', countsTowardTargets: false },
    ],
    onCall: [],
    staffSnapshot: [
      staffMember(1, [Dept.PRE, Dept.PACU]),
      staffMember(2, [Dept.PROC]),
      staffMember(3, [Dept.PRE]),
    ],
    settingsSnapshot: {
      workingDays: [false, true, true, true, true, true, false],
      targetNurses: 13,
      targetTechs: 5,
      procRooms: 2,
      deleteAfter: 18,
      isDark: false,
    },
    seed: 1,
    hasManualEdits: false,
  },
};

describe('weekly schedule generation', () => {
  it('splits a confirmed segment into its six five-day weeks', () => {
    const weeks = getSegmentWeeks(segment);
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual({
      start: '2026-10-05',
      end: '2026-10-09',
      dates: [
        '2026-10-05',
        '2026-10-06',
        '2026-10-07',
        '2026-10-08',
        '2026-10-09',
      ],
    });
    expect(weeks.at(-1)?.start).toBe('2026-11-09');
  });

  it('identifies only weeks whose working-day assignments changed', () => {
    const changedState = {
      ...segment.state,
      shifts: [
        ...segment.state.shifts.filter(
          (shift) => !(shift.staffId === 2 && shift.date === '2026-10-05'),
        ),
        {
          staffId: 2,
          date: '2026-10-06',
          kind: 'work' as const,
          countsTowardTargets: true,
        },
      ],
    };

    expect(getChangedWeekStarts(segment, changedState)).toEqual([
      '2026-10-05',
    ]);
    expect(
      getChangedWeekStarts(segment, {
        ...segment.state,
        onCall: ['1:2026-10-05'],
      }),
    ).toEqual([]);
  });

  it('assigns working staff only to eligible departments and configured procedure rooms', () => {
    const assignments = generateWeeklyAssignments(segment, [
      '2026-10-05',
      '2026-10-06',
    ]);

    expect(assignments).toHaveLength(3);
    expect(assignments.every((assignment) => assignment.date === '2026-10-05')).toBe(true);
    expect(
      assignments.find((assignment) => assignment.staffId === 2),
    ).toMatchObject({ department: Dept.PROC, room: 1, startTime: '07:00' });
    expect(
      assignments
        .filter((assignment) => assignment.department === Dept.PROC)
        .every((assignment) => assignment.room !== null && assignment.room <= 2),
    ).toBe(true);
    expect(
      assignments.find((assignment) => assignment.staffId === 3)?.department,
    ).toBe(Dept.PRE);
  });

  it('fills procedure rooms with two staff each when enough eligible staff are working', () => {
    const procStaff = Array.from({ length: 8 }, (_, index) =>
      staffMember(index + 1, [Dept.PROC]),
    );
    const procSegment: ScheduleSegment = {
      ...segment,
      state: {
        ...segment.state,
        staffSnapshot: procStaff,
        settingsSnapshot: {
          ...segment.state.settingsSnapshot,
          procRooms: 3,
        },
        shifts: procStaff.map((person) => ({
          staffId: person.id,
          date: '2026-10-05',
          kind: 'work',
          countsTowardTargets: true,
        })),
      },
    };

    const assignments = generateWeeklyAssignments(procSegment, ['2026-10-05']);
    const roomCounts = new Map<number, number>();
    for (const assignment of assignments) {
      if (assignment.room !== null) {
        roomCounts.set(
          assignment.room,
          (roomCounts.get(assignment.room) ?? 0) + 1,
        );
      }
    }

    expect([...roomCounts.entries()]).toEqual([
      [1, 3],
      [2, 3],
      [3, 2],
    ]);
    expect(new Set(assignments.map((assignment) => assignment.staffId)).size).toBe(8);
  });

  it('assigns single-department staff first, fills PR rooms, then balances PREOP and PACU', () => {
    const staff = [
      staffMember(1, [Dept.PRE]),
      staffMember(2, [Dept.PACU]),
      staffMember(3, [Dept.PROC]),
      staffMember(4, [Dept.PRE, Dept.PROC]),
      staffMember(5, [Dept.PRE, Dept.PACU]),
      staffMember(6, [Dept.PRE, Dept.PACU]),
    ];
    const algorithmSegment: ScheduleSegment = {
      ...segment,
      state: {
        ...segment.state,
        staffSnapshot: staff,
        settingsSnapshot: {
          ...segment.state.settingsSnapshot,
          procRooms: 2,
        },
        shifts: staff.map((person) => ({
          staffId: person.id,
          date: '2026-10-05',
          kind: 'work',
          countsTowardTargets: true,
        })),
      },
    };

    const assignments = generateWeeklyAssignments(algorithmSegment, ['2026-10-05']);
    const byStaff = new Map(
      assignments.map((assignment) => [assignment.staffId, assignment]),
    );

    expect(byStaff.get(1)?.department).toBe(Dept.PRE);
    expect(byStaff.get(2)?.department).toBe(Dept.PACU);
    expect(byStaff.get(3)).toMatchObject({ department: Dept.PROC, room: 1 });
    expect(byStaff.get(4)).toMatchObject({ department: Dept.PROC, room: 2 });
    expect(byStaff.get(5)?.department).toBe(Dept.PRE);
    expect(byStaff.get(6)?.department).toBe(Dept.PACU);
  });
});
