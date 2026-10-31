import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { ScheduleSegment, Settings, Staff } from '@app/types';
import { Button } from '../inputs/Button';
import { PageContent } from '../layout/PageContent';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));

const formatWeekLabel = (startDate: string) => {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 4);
  return `${formatDate(startDate)} - ${formatDate(end.toISOString().slice(0, 10))}`;
};

const getWeeksForSegment = (segment: ScheduleSegment, settings: Settings) => {
  const days = [] as string[];
  const start = new Date(`${segment.startDate}T00:00:00.000Z`);
  const end = new Date(`${segment.endDate}T00:00:00.000Z`);
  const current = new Date(start);
  while (current <= end) {
    const iso = current.toISOString().slice(0, 10);
    if (settings.workingDays[current.getUTCDay()]) {
      days.push(iso);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  const weeks = [] as { start: string; end: string; label: string }[];
  for (let i = 0; i < days.length; i += 5) {
    const chunk = days.slice(i, i + 5);
    if (chunk.length) {
      weeks.push({
        start: chunk[0],
        end: chunk[chunk.length - 1],
        label: `${formatDate(chunk[0])} - ${formatDate(chunk[chunk.length - 1])}`,
      });
    }
  }
  return weeks;
};

const statusClassName = (status: 'Has weekly schedule' | 'Covered' | 'Not covered') => {
  if (status === 'Has weekly schedule' || status === 'Covered') {
    return 'bg-mint-100 text-mint-600';
  }
  return 'bg-bronze-100 text-bronze-600';
};

export const WeeklySchedulePage = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [segments, setSegments] = useState<ScheduleSegment[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      window.settings.get(),
      window.staff.list(),
      window.segments.list(),
    ])
      .then(([savedSettings, savedStaff, savedSegments]) => {
        if (!active) return;
        setSettings(savedSettings);
        setStaff(savedStaff);
        setSegments(savedSegments.filter((segment) => segment.status === 'confirmed'));
        const first = savedSegments
          .filter((segment) => segment.status === 'confirmed')
          .flatMap((segment) => getWeeksForSegment(segment, savedSettings))
          .map((week) => week.start)[0];
        setSelectedWeek(first ?? null);
      })
      .catch(() => {
        if (active) {
          setSegments([]);
          setStaff([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const weeks = useMemo(() => {
    if (!settings) return [] as Array<{ start: string; label: string; status: 'Has weekly schedule' | 'Covered' | 'Not covered'; segmentId?: number }>;

    const generated = new Set<string>();
    const rows = segments.flatMap((segment) => {
      const segmentWeeks = getWeeksForSegment(segment, settings).map((week) => ({
        start: week.start,
        label: week.label,
        segmentId: segment.id,
        status: 'Covered' as const,
      }));
      segmentWeeks.forEach((week) => generated.add(week.start));
      return segmentWeeks;
    });

    const allDates = segments.flatMap((segment) => getWeeksForSegment(segment, settings).map((week) => week.start));
    const existingStarts = new Set(allDates);

    const coverage = rows.length
      ? rows
      : [];

    const fallback = Array.from(new Set([...existingStarts])).map((start) => ({
      start,
      label: formatWeekLabel(start),
      status: 'Has weekly schedule' as const,
      segmentId: rows.find((row) => row.start === start)?.segmentId,
    }));

    return [...fallback, ...coverage.filter((row) => !fallback.some((entry) => entry.start === row.start))];
  }, [segments, settings]);

  const selected = weeks.find((week) => week.start === selectedWeek) ?? weeks[0] ?? null;

  const displayedRows = useMemo(() => {
    if (!settings || !segments.length) return [] as Array<{ department: string; values: string[] }>;
    const allPeople = staff.filter((person) => person.startTime);
    const values = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    return allPeople.slice(0, 5).map((person) => ({
      department: `${person.lastName} ${person.firstName.slice(0, 1)}.`,
      values: values.map((_, index) => `${person.firstName.slice(0, 1)}. ${person.lastName} · ${person.startTime}`),
    }));
  }, [segments, settings, staff]);

  return (
    <PageContent title="Weekly schedule" actions={[{ ariaLabel: 'Open week view', icon: 'bi-calendar3', variant: 'outlined', onClick: () => selected && navigate(`/schedules/${selected.segmentId ?? 'new'}`) }]}>
      {loading ? (
        <p role="status">Loading weekly data…</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <label className="flex flex-col gap-2 text-left text-sm font-semibold text-grey-900">
              <span className="sr-only">Select week</span>
              <select
                aria-label="Select week"
                value={selectedWeek ?? ''}
                onChange={(event) => setSelectedWeek(event.target.value)}
                className="min-w-52 rounded-xl border border-grey-200 bg-white px-3 py-2 text-sm font-semibold text-grey-900"
              >
                {weeks.length === 0 ? (
                  <option value="">No covered weeks</option>
                ) : (
                  weeks.map((week) => (
                    <option key={`${week.start}-${week.label}`} value={week.start}>
                      {week.label}
                    </option>
                  ))
                )}
              </select>
            </label>
            {selected && (
              <div className={`chip rounded-full px-2 py-1 text-xs font-bold ${statusClassName(selected.status)}`}>
                {selected.status}
              </div>
            )}
          </div>

          <div className="schedule-grid-scroll rounded-2xl border border-grey-50 bg-white p-4">
            <table className="schedule-grid">
              <thead>
                <tr>
                  <th className="schedule-name-cell">Department</th>
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => (
                    <th key={day}>{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-sm text-grey-200">
                      No staff are available for this week yet.
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((row) => (
                    <tr key={row.department}>
                      <th className="schedule-name-cell font-bold text-grey-900">{row.department}</th>
                      {row.values.map((value, index) => (
                        <td key={`${row.department}-${index}`}>{value}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            {selected?.segmentId ? (
              <Button onClick={() => navigate(`/schedules/${selected.segmentId}`)}>Open schedule</Button>
            ) : (
              <Button onClick={() => navigate('/new')}>Create schedule</Button>
            )}
          </div>
        </div>
      )}
    </PageContent>
  );
};

export default WeeklySchedulePage;
