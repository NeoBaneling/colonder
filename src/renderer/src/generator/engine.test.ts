import { describe, expect, it } from 'vitest';
import { Dept, Emp, Role, type ScheduleSegment, type Staff } from '../../../types';
import {
  cellKey,
  dailyCounts,
  generateSegmentShifts,
  getFmlaCellKeys,
  getRolledOverFmlaEntries,
  getSegmentDates,
  isValidFmlaRange,
  nextWorkingStart,
  ptoChangeCount,
  segmentEndDate,
  togglePtoDate,
  validateSegment,
} from './engine';

const staffMember = (
  id: number,
  role: Role,
  employment = Emp.FullTime,
  overrides: Partial<Staff> = {},
): Staff => ({
  id,
  firstName: `Staff${id}`,
  lastName: 'Member',
  title: role === Role.Nurse ? 'RN' : 'Tech',
  role,
  employment,
  departments: [],
  startTime: '07:00',
  isLeader: false,
  inOrientation: false,
  ipcIds: [],
  ...overrides,
});

const settings = {
  workingDays: [false, true, true, true, true, true, false],
  targetNurses: 13,
  targetTechs: 5,
  procRooms: 4,
  deleteAfter: 18,
  isDark: false,
};

describe('six-week schedule engine', () => {
  it('toggles staff PTO dates and counts edits against the starting schedule', () => {
    const original = ['1:2026-10-06', '2:2026-10-07'];
    const added = togglePtoDate(original, '3:2026-10-08');
    const changed = togglePtoDate(added, original[0]);

    expect(added).toEqual([...original, '3:2026-10-08']);
    expect(changed).toEqual(['2:2026-10-07', '3:2026-10-08']);
    expect(ptoChangeCount(original, changed)).toBe(2);
    expect(ptoChangeCount(original, original)).toBe(0);
  });

  const startDate = '2026-10-05';
  const dates = getSegmentDates(startDate, settings.workingDays);

  it('uses the six-week date range without local-time arithmetic', () => {
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe('2026-10-05');
    expect(dates.at(-1)).toBe('2026-11-13');
    expect(segmentEndDate(startDate, settings.workingDays)).toBe('2026-11-13');
  });

  it('starts on the next configured work week after the latest confirmed segment', () => {
    expect(
      nextWorkingStart(
        settings.workingDays,
        ['2026-12-11', '2026-10-30'],
        '2026-10-27',
      ),
    ).toBe('2026-12-14');
    expect(nextWorkingStart(settings.workingDays, [], '2026-10-27')).toBe(
      '2026-11-02',
    );
  });

  it('applies FMLA date borders, blocks assignments, and accepts only valid date ranges', () => {
    const fmlaEntries = [
      {
        staffId: 1,
        onFmla: true,
        startDate: dates[1],
        endDate: dates[3],
        rolledOver: false,
      },
    ];
    const shifts = generateSegmentShifts(
      [staffMember(1, Role.Nurse)],
      dates.slice(0, 5),
      [],
      [],
      startDate,
      12,
      fmlaEntries,
    );

    expect(getFmlaCellKeys(fmlaEntries, dates.slice(0, 5))).toEqual(
      new Set([
        cellKey(1, dates[1]),
        cellKey(1, dates[2]),
        cellKey(1, dates[3]),
      ]),
    );
    expect(
      shifts.filter((shift) => shift.kind === 'fmla').map((shift) => shift.date),
    ).toEqual(dates.slice(1, 4));
    expect(
      shifts.some(
        (shift) =>
          shift.staffId === 1 &&
          dates.slice(1, 4).includes(shift.date) &&
          shift.kind === 'work',
      ),
    ).toBe(false);
    expect(isValidFmlaRange(fmlaEntries[0])).toBe(true);
    expect(
      isValidFmlaRange({
        startDate: dates[3],
        endDate: dates[1],
      }),
    ).toBe(false);
    expect(
      isValidFmlaRange({ startDate: null, endDate: dates[1] }),
    ).toBe(true);
    expect(
      isValidFmlaRange(
        { startDate: null, endDate: dates[0] },
        dates[1],
        dates[4],
      ),
    ).toBe(false);
    expect(
      isValidFmlaRange(
        { startDate: dates[4], endDate: null },
        dates[0],
        dates[3],
      ),
    ).toBe(false);
  });

  it('rolls forward only FMLA that continues beyond the previous segment', () => {
    const previousSegment: ScheduleSegment = {
      id: 1,
      startDate: '2026-08-17',
      endDate: '2026-09-25',
      status: 'confirmed',
      createdAt: '2026-08-01',
      state: {
        step: 'review',
        startDate: '2026-08-17',
        endDate: '2026-09-25',
        fmlaEntries: [
          {
            staffId: 1,
            onFmla: true,
            startDate: '2026-08-17',
            endDate: null,
            rolledOver: false,
          },
          {
            staffId: 2,
            onFmla: true,
            startDate: '2026-09-01',
            endDate: '2026-09-25',
            rolledOver: false,
          },
          {
            staffId: 3,
            onFmla: true,
            startDate: '2026-09-01',
            endDate: '2026-09-26',
            rolledOver: false,
          },
        ],
        ptoDates: [],
        prnDates: [],
        shifts: [],
        onCall: [],
        staffSnapshot: [],
        settingsSnapshot: settings,
        seed: 1,
        hasManualEdits: false,
      },
    };

    expect(
      getRolledOverFmlaEntries(previousSegment, '2026-09-28'),
    ).toEqual([
      {
        staffId: 1,
        onFmla: true,
        startDate: '2026-08-17',
        endDate: null,
        rolledOver: true,
      },
    ]);
  });

  it('generates reproducible, balanced days that respect PTO and exclude PRN totals', () => {
    const staff = [
      ...Array.from({ length: 18 }, (_, index) =>
        staffMember(index + 1, Role.Nurse),
      ),
      ...Array.from({ length: 7 }, (_, index) =>
        staffMember(index + 19, Role.Tech),
      ),
    ];
    const ptoDates = [cellKey(1, dates[0]), cellKey(19, dates[1])];
    const first = generateSegmentShifts(
      staff,
      dates,
      ptoDates,
      [],
      startDate,
      88,
    );
    const second = generateSegmentShifts(
      staff,
      dates,
      ptoDates,
      [],
      startDate,
      88,
    );

    expect(first).toEqual(second);
    expect(
      first.some(
        (shift) =>
          shift.staffId === 1 &&
          shift.date === dates[0] &&
          shift.kind === 'work',
      ),
    ).toBe(false);

    for (const weekStart of [0, 5, 10, 15, 20, 25]) {
      const counts = dates
        .slice(weekStart, weekStart + 5)
        .map((date) => dailyCounts(date, staff, first));
      const nurseCounts = counts.map(({ nurses }) => nurses);
      const techCounts = counts.map(({ techs }) => techs);
      expect(Math.max(...nurseCounts) - Math.min(...nurseCounts)).toBeLessThanOrEqual(1);
      expect(Math.max(...techCounts) - Math.min(...techCounts)).toBeLessThanOrEqual(1);
      expect(Math.min(...nurseCounts)).toBeGreaterThanOrEqual(settings.targetNurses);
      expect(Math.min(...techCounts)).toBeGreaterThanOrEqual(settings.targetTechs);
    }
  });

  it('locks PRN commitments out of target totals and never schedules PRN elsewhere', () => {
    const commitment = cellKey(1, dates[0]);
    const staff = [
      staffMember(1, Role.Nurse, Emp.PRN),
      staffMember(2, Role.Tech, Emp.FullTime, { inOrientation: true }),
    ];
    const shifts = generateSegmentShifts(
      staff,
      dates,
      [],
      [commitment],
      startDate,
      12,
    );
    const prnWorkDates = shifts
      .filter((shift) => shift.staffId === 1 && shift.kind === 'work')
      .map((shift) => shift.date);

    expect(prnWorkDates).toEqual([dates[0]]);
    expect(
      shifts.find(
        (shift) =>
          shift.staffId === 2 &&
          shift.kind === 'work' &&
          shift.date === dates[0],
      )?.countsTowardTargets,
    ).toBe(false);
    expect(dailyCounts(dates[0], staff, shifts)).toEqual({
      nurses: 0,
      techs: 0,
    });
  });

  it('respects preferred weekdays and prioritizes PROC coverage by role', () => {
    const preferredDays = [false, true, true, true, true, false, false];
    const preferredStaff = staffMember(1, Role.Nurse, Emp.FullTime, {
      preferredWorkingDays: preferredDays,
    });
    const preferredShifts = generateSegmentShifts(
      [preferredStaff],
      dates.slice(0, 5),
      [],
      [],
      startDate,
      12,
    );
    expect(
      preferredShifts
        .filter((shift) => shift.kind === 'work')
        .map((shift) => shift.date)
        .sort(),
    ).toEqual(dates.slice(0, 4));

    const procStaff = [
      ...Array.from({ length: 3 }, (_, index) =>
        staffMember(index + 1, Role.Nurse, Emp.FullTime, {
          departments: [Dept.PROC],
        }),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        staffMember(index + 4, Role.Tech, Emp.FullTime, {
          departments: [Dept.PROC],
        }),
      ),
    ];
    const procShifts = generateSegmentShifts(
      procStaff,
      dates.slice(0, 5),
      [],
      [],
      startDate,
      12,
      [],
      2,
    );
    for (const date of dates.slice(0, 5)) {
      expect(dailyCounts(date, procStaff, procShifts).nurses).toBeGreaterThanOrEqual(2);
      expect(dailyCounts(date, procStaff, procShifts).techs).toBeGreaterThanOrEqual(2);
    }
  });

  it('schedules CSLs by employment type, covers every workday when possible, and excludes them from targets', () => {
    const chargeStaff = [
      staffMember(1, Role.ChargeNurse),
      staffMember(2, Role.ChargeNurse),
      staffMember(3, Role.ChargeNurse, Emp.PartTime),
    ];
    const weekDates = dates.slice(0, 5);
    const shifts = generateSegmentShifts(
      chargeStaff,
      weekDates,
      [],
      [],
      startDate,
      42,
    );
    const workShifts = shifts.filter((shift) => shift.kind === 'work');

    expect(
      workShifts.filter((shift) => shift.staffId === 1),
    ).toHaveLength(4);
    expect(
      workShifts.filter((shift) => shift.staffId === 2),
    ).toHaveLength(4);
    expect(
      workShifts.filter((shift) => shift.staffId === 3),
    ).toHaveLength(3);
    expect(
      workShifts.every((shift) => !shift.countsTowardTargets),
    ).toBe(true);
    expect(
      weekDates.every((date) =>
        workShifts.some((shift) => shift.date === date),
      ),
    ).toBe(true);
    expect(dailyCounts(weekDates[0], chargeStaff, shifts)).toEqual({
      nurses: 0,
      techs: 0,
    });
    expect(
      validateSegment(chargeStaff, weekDates, shifts, settings).some(
        (warning) => warning.code === 'CHARGE_COVERAGE_GAP',
      ),
    ).toBe(false);
  });

  it('respects CSL PTO and reports an uncovered working day', () => {
    const chargeStaff = [staffMember(1, Role.ChargeNurse)];
    const weekDates = dates.slice(0, 5);
    const ptoDate = weekDates[0];
    const shifts = generateSegmentShifts(
      chargeStaff,
      weekDates,
      [cellKey(1, ptoDate)],
      [],
      startDate,
      42,
    );
    const warnings = validateSegment(
      chargeStaff,
      weekDates,
      shifts,
      settings,
      [],
      startDate,
    );

    expect(
      shifts.some(
        (shift) =>
          shift.staffId === 1 &&
          shift.date === ptoDate &&
          shift.kind === 'pto',
      ),
    ).toBe(true);
    expect(
      warnings.filter((warning) => warning.code === 'CHARGE_COVERAGE_GAP'),
    ).toMatchObject([{ date: ptoDate }]);
  });

  it('schedules PRN CSLs only on selected commitment days', () => {
    const commitment = cellKey(1, dates[0]);
    const chargeStaff = [staffMember(1, Role.ChargeNurse, Emp.PRN)];
    const shifts = generateSegmentShifts(
      chargeStaff,
      dates.slice(0, 5),
      [],
      [commitment],
      startDate,
      12,
    );

    expect(
      shifts.filter((shift) => shift.kind === 'work'),
    ).toEqual([
      expect.objectContaining({
        staffId: 1,
        date: dates[0],
        countsTowardTargets: false,
      }),
    ]);
  });

  it('warns when PTO makes the weekly work requirement impossible', () => {
    const staff = [staffMember(1, Role.Nurse)];
    const oneAvailableDate = dates
      .slice(1, 5)
      .map((date) => cellKey(1, date));
    const shifts = generateSegmentShifts(
      staff,
      dates.slice(0, 5),
      oneAvailableDate,
      [],
      startDate,
      2,
    );
    const warnings = validateSegment(
      staff,
      dates.slice(0, 5),
      shifts,
      settings,
      [],
      startDate,
    );

    expect(warnings.some((warning) => warning.code === 'STAFF_SHORT_OF_DAYS')).toBe(true);
    expect(
      shifts.some(
        (shift) =>
          shift.date === dates[0] &&
          shift.staffId === 1 &&
          shift.kind === 'work',
      ),
    ).toBe(true);
  });
});
