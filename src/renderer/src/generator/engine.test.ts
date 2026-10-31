import { describe, expect, it } from 'vitest';
import { Emp, Role, type Staff } from '../../../types';
import {
  cellKey,
  dailyCounts,
  generateSegmentShifts,
  getSegmentDates,
  nextWorkingStart,
  segmentEndDate,
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
