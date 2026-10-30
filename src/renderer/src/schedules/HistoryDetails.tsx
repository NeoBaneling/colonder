import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Role, type ScheduleSegment, type WeeklySchedule } from '@app/types';
import { IconButton } from '../inputs/IconButton';
import { PageContent } from '../layout/PageContent';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));

const formatHeaderDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));

const formatTitle = (segment: ScheduleSegment | null) => {
  if (!segment) return 'Schedule details';
  return `${formatDate(segment.startDate)} – ${formatDate(segment.endDate)}`;
};

const buildWeeklyGroups = (segment: ScheduleSegment) => {
  const allDates: string[] = [];
  const cursor = new Date(`${segment.startDate}T00:00:00.000Z`);
  const end = new Date(`${segment.endDate}T00:00:00.000Z`);

  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    if (segment.state.settingsSnapshot.workingDays[cursor.getUTCDay()]) {
      allDates.push(iso);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const groups: Array<{ start: string; end: string; dates: string[]; label: string }> = [];
  for (let index = 0; index < 6; index += 1) {
    const dates = allDates.slice(index * 5, index * 5 + 5);
    if (dates.length === 0) break;
    groups.push({
      start: dates[0],
      end: dates[dates.length - 1],
      dates,
      label: `${formatHeaderDate(dates[0])} - ${formatHeaderDate(dates[dates.length - 1])}`,
    });
  }

  return groups;
};

export const HistoryDetailsPage = () => {
  const navigate = useNavigate();
  const { scheduleId } = useParams();
  const [segment, setSegment] = useState<ScheduleSegment | null>(null);
  const [weeklySchedules, setWeeklySchedules] = useState<WeeklySchedule[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    window.segments.list()
      .then(async (savedSegments) => {
        if (!active) return;
        const match = savedSegments.find((item) => item.id === Number(scheduleId));
        setSegment(match ?? null);
        if (!match) {
          setLoadError('This schedule could not be found.');
          return;
        }
        const savedWeeks = await window.weeklySchedules.listForSegment(match.id);
        if (active) setWeeklySchedules(savedWeeks);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : 'Unable to load schedule details.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, [scheduleId]);

  const rows = useMemo(() => {
    if (!segment) return [] as Array<{ name: string; status: Record<string, 'W' | 'P' | '–'> }>;
    const people = [...segment.state.staffSnapshot].sort((a, b) => {
      if (a.lastName !== b.lastName) return a.lastName.localeCompare(b.lastName);
      return a.firstName.localeCompare(b.firstName);
    });

    return people.map((person) => {
      const status: Record<string, 'W' | 'P' | '–'> = {};
      for (const shift of segment.state.shifts) {
        if (shift.staffId === person.id) {
          if (shift.kind === 'work') status[shift.date] = 'W';
          if (shift.kind === 'pto') status[shift.date] = 'P';
        }
      }
      return {
        name: `${person.lastName}, ${person.firstName.slice(0, 1)}.`,
        status,
      };
    });
  }, [segment]);

  const weekGroups = useMemo(() => {
    if (!segment) return [] as Array<{ start: string; end: string; dates: string[]; label: string }>;
    return buildWeeklyGroups(segment);
  }, [segment]);
  const generatedWeekStarts = new Set(
    weeklySchedules.map((schedule) => schedule.weekStart),
  );

  const allDates = weekGroups.flatMap((group) => group.dates);
  const groupByDate = new Map<string, number>();
  weekGroups.forEach((group, groupIndex) => {
    group.dates.forEach((date) => groupByDate.set(date, groupIndex));
  });
  const weekClassName = (weekIndex: number) =>
    `history-week-group-${weekIndex} ${weekIndex % 2 === 0 ? 'history-week-even' : 'history-week-odd'}${
      hoveredWeek === weekIndex ? ' history-week-hover' : ''
    }`;

  const dateTotals = useMemo(() => {
    if (!segment) return new Map<string, { nurses: number; techs: number }>();
    const totals = new Map<string, { nurses: number; techs: number }>();
    for (const date of allDates) {
      totals.set(date, { nurses: 0, techs: 0 });
    }
    for (const person of segment.state.staffSnapshot) {
      for (const date of allDates) {
        const shift = segment.state.shifts.find(
          (entry) => entry.staffId === person.id && entry.date === date && entry.kind === 'work',
        );
        if (!shift) continue;
        const bucket = totals.get(date);
        if (!bucket) continue;
        if (person.role === Role.Nurse) bucket.nurses += 1;
        if (person.role === Role.Tech) bucket.techs += 1;
      }
    }
    return totals;
  }, [allDates, segment]);

  if (loadError) {
    return (
      <PageContent title="Schedule details" canReturn>
        <p role="alert">{loadError}</p>
      </PageContent>
    );
  }

  if (!segment) {
    return (
      <PageContent title="Schedule details" canReturn>
        <p role="status">Loading schedule…</p>
      </PageContent>
    );
  }

  return (
    <PageContent
      title={formatTitle(segment)}
      canReturn
      actions={[
        {
          ariaLabel: 'Print schedule',
          icon: 'bi-printer',
          variant: 'outlined',
          onClick: () => window.print(),
        },
        {
          ariaLabel: 'Download schedule',
          icon: 'bi-download',
          variant: 'outlined',
          onClick: () => undefined,
        },
        {
          ariaLabel: 'Edit schedule',
          icon: 'bi-pencil',
          variant: 'filled',
          onClick: () => navigate(`/schedules/${segment.id}/edit`),
        },
      ]}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <div
          className="schedule-grid-scroll history-grid-scroll"
          data-scrolled={isScrolled}
          onScroll={(event) => setIsScrolled(event.currentTarget.scrollLeft > 0)}
        >
          <table className="schedule-grid history-details-grid">
            <thead>
              <tr>
                <th className="schedule-name-cell" scope="col" aria-hidden="true" />
                {weekGroups.map((group, index) => (
                  <th
                    key={`${group.start}-${group.end}`}
                    colSpan={group.dates.length}
                    scope="colgroup"
                    className={`schedule-week-cell history-week-header ${weekClassName(index)}`}
                    onMouseEnter={() => setHoveredWeek(index)}
                    onMouseLeave={() => setHoveredWeek(null)}
                  >
                    <div className="flex items-center justify-between gap-2 px-2">
                      <div className="flex flex-col items-start">
                        <span className="text-xs font-bold text-grey-900">{group.label}</span>
                        <span className="text-xs font-normal text-grey-600">Week {index + 1}</span>
                      </div>
                      <IconButton
                        ariaLabel={generatedWeekStarts.has(group.start) ? 'View weekly schedule' : 'Generate weekly schedule'}
                        title={generatedWeekStarts.has(group.start) ? 'View weekly schedule' : 'Generate weekly schedule'}
                        icon={generatedWeekStarts.has(group.start) ? 'bi-eye' : 'bi-arrow-repeat'}
                        variant="outlined"
                        className="history-week-action h-7! w-7! rounded-full! border-mint-600! text-mint-600!"
                        onClick={() => navigate(`/schedules/${segment.id}/weekly/${group.start}`)}
                      />
                    </div>
                  </th>
                ))}
              </tr>
              <tr>
                <th
                  className="schedule-name-cell history-day-cell"
                  scope="col"
                  aria-hidden="true"
                />
                {allDates.map((date) => (
                  <th
                    key={date}
                    className={`schedule-day-cell history-day-cell ${weekClassName(groupByDate.get(date) ?? 0)}`}
                    scope="col"
                    title={formatDate(date)}
                    onMouseEnter={() => setHoveredWeek(groupByDate.get(date) ?? 0)}
                    onMouseLeave={() => setHoveredWeek(null)}
                  >
                    {new Intl.DateTimeFormat('en-US', {
                      weekday: 'short',
                      timeZone: 'UTC',
                    }).format(new Date(`${date}T00:00:00.000Z`)).slice(0, 1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <th className="schedule-name-cell" scope="row">
                    <span className="schedule-staff-label">{row.name}</span>
                  </th>
                  {allDates.map((date) => {
                    const value = row.status[date];
                    const cellClass =
                      value === 'W'
                        ? 'schedule-cell-work'
                        : value === 'P'
                          ? 'schedule-cell-pto'
                          : '';
                    return (
                      <td
                        key={`${row.name}-${date}`}
                        className={`${weekClassName(groupByDate.get(date) ?? 0)} ${cellClass}`}
                        onMouseEnter={() => setHoveredWeek(groupByDate.get(date) ?? 0)}
                        onMouseLeave={() => setHoveredWeek(null)}
                      >
                        <span className={`schedule-cell ${cellClass}`}>{value ?? '—'}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th className="schedule-name-cell" scope="row">
                  {`Nurses / ${segment.state.settingsSnapshot.targetNurses}`}
                </th>
                {allDates.map((date) => (
                  <td
                    key={`nurse-${date}`}
                    className={weekClassName(groupByDate.get(date) ?? 0)}
                    onMouseEnter={() => setHoveredWeek(groupByDate.get(date) ?? 0)}
                    onMouseLeave={() => setHoveredWeek(null)}
                  >
                    <span className="schedule-total">{dateTotals.get(date)?.nurses ?? 0}</span>
                  </td>
                ))}
              </tr>
              <tr>
                <th className="schedule-name-cell" scope="row">
                  {`Techs / ${segment.state.settingsSnapshot.targetTechs}`}
                </th>
                {allDates.map((date) => (
                  <td
                    key={`tech-${date}`}
                    className={weekClassName(groupByDate.get(date) ?? 0)}
                    onMouseEnter={() => setHoveredWeek(groupByDate.get(date) ?? 0)}
                    onMouseLeave={() => setHoveredWeek(null)}
                  >
                    <span className="schedule-total">{dateTotals.get(date)?.techs ?? 0}</span>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </PageContent>
  );
};

export default HistoryDetailsPage;
