import { describe, expect, it } from 'vitest';
import { addTimeMinutes, formatTime, parseTime } from './time';

describe('parseTime', () => {
  it.each([
    ['7:00 AM', '07:00'],
    ['7:30a', '07:30'],
    ['7:15 PM', '19:15'],
    ['7:01 AM', '07:01'],
    ['725', '07:25'],
    ['730', '07:30'],
    ['07:00', '07:00'],
    ['7:00 PM', '19:00'],
    ['12:30 AM', '00:30'],
    ['12:30 PM', '12:30'],
    ['19:30', '19:30'],
  ])('parses %s as %s', (input, expected) => {
    expect(parseTime(input)).toEqual({ value: expected, error: null });
  });

  it.each(['', '7:60 AM', '25:00'])(
    'rejects invalid time %s',
    (input) => {
      expect(parseTime(input).value).toBeNull();
    },
  );
});

describe('time formatting helpers', () => {
  it('formats a stored 24-hour time for display', () => {
    expect(formatTime('07:00')).toBe('7:00 AM');
    expect(formatTime('19:30')).toBe('7:30 PM');
  });

  it('moves in 15-minute steps across midnight', () => {
    expect(addTimeMinutes('07:00', 15)).toBe('07:15');
    expect(addTimeMinutes('23:45', 15)).toBe('00:00');
    expect(addTimeMinutes('00:00', -15)).toBe('23:45');
  });
});
