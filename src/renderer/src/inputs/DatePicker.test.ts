import { describe, expect, it } from 'vitest';
import {
  getDatePickerCalendarDays,
  isDateWithinPickerRange,
} from './DatePicker';

describe('FMLA date picker calendar', () => {
  it('renders complete Sunday-through-Saturday calendar weeks in UTC', () => {
    const november = getDatePickerCalendarDays(
      new Date('2026-11-01T00:00:00.000Z'),
    );

    expect(november).toHaveLength(35);
    expect(november[0].toISOString().slice(0, 10)).toBe('2026-11-01');
    expect(november.at(-1)?.toISOString().slice(0, 10)).toBe('2026-12-05');
  });

  it('includes leading and trailing days when a month spans six calendar weeks', () => {
    const august = getDatePickerCalendarDays(
      new Date('2026-08-01T00:00:00.000Z'),
    );

    expect(august).toHaveLength(42);
    expect(august[0].toISOString().slice(0, 10)).toBe('2026-07-26');
    expect(august.at(-1)?.toISOString().slice(0, 10)).toBe('2026-09-05');
  });

  it('allows dates on the range boundaries but rejects dates outside them', () => {
    expect(
      isDateWithinPickerRange(
        '2026-10-05',
        '2026-10-05',
        '2026-11-13',
      ),
    ).toBe(true);
    expect(
      isDateWithinPickerRange(
        '2026-11-13',
        '2026-10-05',
        '2026-11-13',
      ),
    ).toBe(true);
    expect(
      isDateWithinPickerRange(
        '2026-10-04',
        '2026-10-05',
        '2026-11-13',
      ),
    ).toBe(false);
    expect(
      isDateWithinPickerRange(
        '2026-11-14',
        '2026-10-05',
        '2026-11-13',
      ),
    ).toBe(false);
  });
});
