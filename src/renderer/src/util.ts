import { Dept } from '../../types';

export const fmtDept = (dept: Dept) => {
  if (dept === Dept.PACU) return 'PACU';
  if (dept === Dept.PROC) return 'PROC';
  return 'PRE';
};

/**
 * @param time24 HH:MM
 * @return hh:MMam/pm
 */
export const fmtTime = (time24: string): string => {
  // Split the string into hours and minutes
  const [hoursStr, minutesStr] = time24.split(':');
  let hours = parseInt(hoursStr, 10);

  // Determine AM or PM
  const ampm = hours >= 12 ? 'PM' : 'AM';

  // Convert hours to 12-hour format
  hours = hours % 12;
  hours = hours ? hours : 12; // The hour '0' should be '12'

  // Pad single-digit hours with a leading zero
  const hoursFormatted = hours < 10 ? `0${hours}` : `${hours}`;

  return `${hoursFormatted}:${minutesStr} ${ampm}`;
};
