import { describe, expect, it } from 'vitest';
import { Dept, Emp, Role, type ScheduleSegment, type Staff } from './types';
import {
  generateWeeklyAssignments,
  getCalendarWeekRange,
  getChangedWeekStarts,
  getSegmentCalendarRange,
  getSegmentWeeks,
} from './weekly';

const staffMember = (
  id: number,
  departments: Dept[],
  role = Role.Nurse,
  overrides: Partial<Staff> = {},
): Staff => ({
  id,
  firstName: `Staff${id}`,
  lastName: 'Member',
  title: role === Role.Tech ? 'Tech' : 'RN',
  role,
  employment: Emp.FullTime,
  departments,
  startTime: '07:00',
  isLeader: false,
  inOrientation: false,
  ipcIds: [],
  ...overrides,
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
    fmlaEntries: [],
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
  it('uses Sunday-through-Saturday calendar weeks for schedule periods', () => {
    expect(getCalendarWeekRange('2026-11-01')).toEqual({
      start: '2026-11-01',
      end: '2026-11-07',
    });

    const novemberSegment: ScheduleSegment = {
      ...segment,
      startDate: '2026-11-02',
      endDate: '2026-12-11',
      state: {
        ...segment.state,
        startDate: '2026-11-02',
        endDate: '2026-12-11',
      },
    };
    expect(getSegmentCalendarRange(novemberSegment)).toEqual({
      start: '2026-11-01',
      end: '2026-12-12',
    });
  });

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

  it('lists CSL assignments on the separate CHARGE row', () => {
    const chargeStaff: Staff = {
      ...staffMember(4, []),
      role: Role.ChargeNurse,
      title: 'Charge Nurse',
    };
    const chargeSegment: ScheduleSegment = {
      ...segment,
      state: {
        ...segment.state,
        staffSnapshot: [...segment.state.staffSnapshot, chargeStaff],
        shifts: [
          ...segment.state.shifts,
          {
            staffId: chargeStaff.id,
            date: '2026-10-05',
            kind: 'work',
            countsTowardTargets: false,
          },
        ],
      },
    };

    expect(
      generateWeeklyAssignments(chargeSegment, ['2026-10-05']),
    ).toContainEqual({
      date: '2026-10-05',
      staffId: chargeStaff.id,
      department: 'CHARGE',
      room: null,
      startTime: '07:00',
    });
  });

  it('fills each procedure room with a nurse and tech, pairing orientation staff as extras', () => {
    const procStaff = [
      ...Array.from({ length: 3 }, (_, index) =>
        staffMember(index + 1, [Dept.PROC]),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        staffMember(index + 4, [Dept.PROC], Role.Tech),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        staffMember(index + 7, [Dept.PROC], Role.Nurse, {
          inOrientation: true,
        }),
      ),
    ];
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
          countsTowardTargets: !person.inOrientation,
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

    expect([...roomCounts.entries()]).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(new Set(assignments.map((assignment) => assignment.staffId)).size).toBe(9);
    for (const room of [1, 2, 3]) {
      const members = assignments
        .filter((assignment) => assignment.room === room)
        .map((assignment) => procStaff.find((person) => person.id === assignment.staffId)!);
      expect(members.filter((person) => person.role === Role.Nurse && !person.inOrientation)).toHaveLength(1);
      expect(members.filter((person) => person.role === Role.Tech)).toHaveLength(1);
      expect(members.filter((person) => person.inOrientation)).toHaveLength(1);
      expect(
        members.some(
          (person) =>
            person.inOrientation &&
            members.some(
              (buddy) =>
                !buddy.inOrientation && buddy.role === person.role,
            ),
        ),
      ).toBe(true);
    }
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
    expect(
      new Set([byStaff.get(5)?.department, byStaff.get(6)?.department]),
    ).toEqual(new Set([Dept.PRE, Dept.PACU]));
  });

  it('fits weekly department start-time goals without changing preferred times', () => {
    const goalStaff = [
      ...Array.from({ length: 3 }, (_, index) =>
        staffMember(index + 1, [Dept.PRE], Role.Nurse, {
          startTime: '06:00',
        }),
      ),
      staffMember(4, [Dept.PRE], Role.Nurse, { startTime: '07:00' }),
      staffMember(5, [Dept.PRE], Role.Tech, { startTime: '07:00' }),
      ...Array.from({ length: 5 }, (_, index) =>
        staffMember(index + 6, [Dept.PACU], Role.Nurse, {
          startTime: '08:00',
        }),
      ),
      staffMember(11, [Dept.PACU], Role.Tech, { startTime: '08:00' }),
      staffMember(12, [Dept.PROC], Role.Nurse, { startTime: '07:00' }),
      staffMember(13, [Dept.PROC], Role.Tech, { startTime: '07:00' }),
      staffMember(14, [Dept.PROC], Role.Nurse, { startTime: '07:00' }),
      staffMember(15, [Dept.PROC], Role.Tech, { startTime: '07:00' }),
    ];
    const goalSegment: ScheduleSegment = {
      ...segment,
      state: {
        ...segment.state,
        staffSnapshot: goalStaff,
        settingsSnapshot: {
          ...segment.state.settingsSnapshot,
          procRooms: 2,
        },
        shifts: goalStaff.map((person) => ({
          staffId: person.id,
          date: '2026-10-05',
          kind: 'work',
          countsTowardTargets: true,
        })),
      },
    };

    const assignments = generateWeeklyAssignments(goalSegment, ['2026-10-05']);
    const startsByDepartment = (department: Dept) =>
      assignments
        .filter((assignment) => assignment.department === department)
        .map((assignment) => {
          const person = goalStaff.find(
            (member) => member.id === assignment.staffId,
          )!;
          expect(assignment.startTime).toBe(person.startTime);
          return `${person.role}:${assignment.startTime}`;
        })
        .sort();

    expect(startsByDepartment(Dept.PRE)).toEqual([
      '0:06:00',
      '0:06:00',
      '0:06:00',
      '0:07:00',
      '1:07:00',
    ]);
    expect(startsByDepartment(Dept.PACU)).toEqual([
      '0:08:00',
      '0:08:00',
      '0:08:00',
      '0:08:00',
      '0:08:00',
      '1:08:00',
    ]);
    expect(
      assignments.filter((assignment) => assignment.department === Dept.PROC),
    ).toHaveLength(4);
    for (const room of [1, 2]) {
      expect(
        assignments.filter(
          (assignment) =>
            assignment.department === Dept.PROC && assignment.room === room,
        ),
      ).toHaveLength(2);
    }
  });

  it('places on-call staff in their selected department and honors preferred weekdays', () => {
    const preferredStaff = staffMember(1, [Dept.PRE, Dept.PACU], Role.Nurse, {
      preferredWorkingDays: [false, true, true, true, true, false, false],
    });
    const onCallSegment: ScheduleSegment = {
      ...segment,
      state: {
        ...segment.state,
        staffSnapshot: [preferredStaff],
        shifts: [
          {
            staffId: preferredStaff.id,
            date: '2026-10-05',
            kind: 'work',
            countsTowardTargets: true,
          },
          {
            staffId: preferredStaff.id,
            date: '2026-10-09',
            kind: 'work',
            countsTowardTargets: true,
          },
        ],
        onCall: ['1:2026-10-05'],
        onCallDepartments: { '1:2026-10-05': Dept.PACU },
      },
    };

    expect(
      generateWeeklyAssignments(onCallSegment, [
        '2026-10-05',
        '2026-10-09',
      ]),
    ).toEqual([
      {
        date: '2026-10-05',
        staffId: 1,
        department: Dept.PACU,
        room: null,
        startTime: '07:00',
      },
    ]);
  });
});
