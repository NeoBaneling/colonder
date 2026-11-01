export type ParsedTime =
  | { value: string; error: null }
  | { value: null; error: string };

export const formatTime = (time: string) => {
  const [hoursText, minutes] = time.split(':');
  const hours = Number(hoursText);
  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
};

export const parseTime = (input: string): ParsedTime => {
  const value = input.trim().toLowerCase();
  const compact = value.match(/^(\d{3,4})$/);
  const match = compact
    ? null
    : value.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(a|am|p|pm)?$/);

  if (!compact && !match) {
    return { value: null, error: 'Enter a valid time, such as 7:00 AM.' };
  }

  let hours = compact
    ? Number(compact[1].slice(0, -2))
    : Number(match![1]);
  const minutes = compact
    ? Number(compact[1].slice(-2))
    : Number(match![2] ?? 0);
  const period = compact ? undefined : match![3];

  if (minutes > 59 || hours > (period ? 12 : 23) || hours < (period ? 1 : 0)) {
    return { value: null, error: 'Enter a valid time, such as 7:00 AM.' };
  }
  if (period) {
    hours = (hours % 12) + (period.startsWith('p') ? 12 : 0);
  }
  return {
    value: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    error: null,
  };
};

export const addTimeMinutes = (time: string, amount: number) => {
  const [hours, minutes] = time.split(':').map(Number);
  const total = (hours * 60 + minutes + amount + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
