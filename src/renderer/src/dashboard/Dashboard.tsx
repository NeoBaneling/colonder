import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Role,
  type ScheduleSegment,
  type Settings,
  type WeeklySchedule,
} from '@app/types';
import { getSegmentWeeks } from '../../../weekly';
import Logo from '../assets/logo.svg?react';
import { Button } from '../inputs/Button';
import { nextWorkingStart, segmentEndDate } from '../generator/engine';
import { IconButton } from '../inputs/IconButton';
import { PageContent } from '../layout/PageContent';

const dateLabel = (value: string, includeYear = false) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));

const weekdayLabel = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));

const localDateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const daysBetween = (start: string, end: string) =>
  Math.round(
    (new Date(`${end}T00:00:00.000Z`).getTime() -
      new Date(`${start}T00:00:00.000Z`).getTime()) /
      (24 * 60 * 60 * 1000),
  );

const nextWeeklyPeriod = (segments: ScheduleSegment[], today: string) =>
  segments
    .filter((item) => item.status === 'confirmed')
    .flatMap((item) =>
      getSegmentWeeks(item)
        .filter((week) => week.start > today)
        .map((week) => ({ segment: item, week })),
    )
    .sort((a, b) => a.week.start.localeCompare(b.week.start))[0] ?? null;

const startsIn = (days: number) =>
  days === 0 ? 'starts today' : `starts in ${days} day${days === 1 ? '' : 's'}`;

const formatTime = (value: string) => {
  const [hoursText, minutes] = value.split(':');
  const hours = Number(hoursText);
  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
};

const getTimeOfDay = (hour: number) => {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const today = localDateString(now);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [segments, setSegments] = useState<ScheduleSegment[]>([]);
  const [segment, setSegment] = useState<ScheduleSegment | null>(null);
  const [weeklySchedules, setWeeklySchedules] = useState<WeeklySchedule[]>([]);
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const loadDashboard = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [savedSettings, savedSegments, staff] = await Promise.all([
          window.settings.get(),
          window.segments.list(),
          window.staff.list(),
        ]);
        const current = savedSegments
          .filter(
            (item) =>
              item.status === 'confirmed' &&
              item.startDate <= today &&
              item.endDate >= today,
          )
          .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
        const upcomingWeek = nextWeeklyPeriod(savedSegments, today);
        const relevantSegmentIds = new Set(
          [current?.id, upcomingWeek?.segment.id].filter(
            (id): id is number => id !== undefined,
          ),
        );

        const schedules = await Promise.all(
          [...relevantSegmentIds].map((id) =>
            window.weeklySchedules.listForSegment(id),
          ),
        );
        if (!active) return;
        setSettings(savedSettings);
        setSegments(savedSegments);
        setStaffCount(staff.length);
        setSegment(current);
        setWeeklySchedules(schedules.flat());
      } catch (error: unknown) {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : 'Unable to load dashboard schedules.',
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadDashboard();
    return () => {
      active = false;
    };
  }, [today]);

  const weeks = useMemo(
    () => (segment ? getSegmentWeeks(segment) : []),
    [segment],
  );
  const currentWeekIndex = segment
    ? Math.max(
        0,
        weeks.findIndex((week, index) => {
          const nextWeekStart = weeks[index + 1]?.start;
          return (
            today >= week.start &&
            (nextWeekStart ? today < nextWeekStart : today <= segment.endDate)
          );
        }),
      )
    : -1;
  const currentWeek = weeks[currentWeekIndex] ?? null;
  const savedWeeklySchedule = weeklySchedules.find(
    (schedule) => schedule.weekStart === currentWeek?.start,
  );
  const nextSixWeekStart = settings
    ? nextWorkingStart(
        settings.workingDays,
        segments
          .filter((item) => item.status === 'confirmed')
          .map((item) => item.endDate),
        today,
      )
    : '';
  const nextSixWeekDays = nextSixWeekStart
    ? daysBetween(today, nextSixWeekStart)
    : -1;
  const hasNextSixWeekSchedule = segments.some(
    (item) => item.startDate === nextSixWeekStart,
  );
  const showNextSixWeek =
    Boolean(nextSixWeekStart) &&
    nextSixWeekDays >= 0 &&
    nextSixWeekDays <= 5 &&
    !hasNextSixWeekSchedule;
  const nextSixWeekEnd =
    showNextSixWeek && settings
      ? segmentEndDate(nextSixWeekStart, settings.workingDays)
      : '';
  const upcomingWeek = nextWeeklyPeriod(segments, today);
  const upcomingWeekDays = upcomingWeek
    ? daysBetween(today, upcomingWeek.week.start)
    : -1;
  const hasUpcomingWeeklySchedule = upcomingWeek
    ? weeklySchedules.some(
        (schedule) =>
          schedule.segmentId === upcomingWeek.segment.id &&
          schedule.weekStart === upcomingWeek.week.start,
      )
    : true;
  const showNextWeekly =
    Boolean(upcomingWeek) &&
    upcomingWeekDays >= 0 &&
    upcomingWeekDays <= 5 &&
    !hasUpcomingWeeklySchedule;
  const upcomingCardsCount = Number(showNextSixWeek) + Number(showNextWeekly);

  const todaySummary = useMemo(() => {
    if (!segment) return null;
    const workingStaffIds = new Set(
      segment.state.shifts
        .filter((shift) => shift.date === today && shift.kind === 'work')
        .map((shift) => shift.staffId),
    );
    const workingStaff = segment.state.staffSnapshot.filter((person) =>
      workingStaffIds.has(person.id),
    );
    const assignments = savedWeeklySchedule?.assignments.filter(
      (assignment) => assignment.date === today,
    );
    const startTimes = (
      assignments?.map((assignment) => assignment.startTime) ??
      workingStaff.map((person) => person.startTime)
    ).filter(Boolean);

    return {
      nurses: workingStaff.filter((person) => person.role === Role.Nurse).length,
      techs: workingStaff.filter((person) => person.role === Role.Tech).length,
      firstStart: startTimes.length
        ? formatTime(startTimes.sort()[0])
        : null,
    };
  }, [savedWeeklySchedule, segment, today]);

  const greeting = `Good ${getTimeOfDay(now.getHours())}`;
  const routeToScheduleAction = (
    filename: string,
    route: string,
    action: 'print' | 'download',
  ) => {
    navigate(route, { state: { dashboardAction: action, filename } });
  };

  return (
    <PageContent title={greeting}>
      <p className="-mt-3 text-sm text-grey-600">
        {new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }).format(now)}
      </p>
      {loadError ? (
        <p role="alert">Unable to load dashboard: {loadError}</p>
      ) : isLoading ? (
        <p role="status">Loading current schedules…</p>
      ) : staffCount === 0 ? (
        <div className="card w-full max-w-2xl items-center justify-center gap-4 py-10 text-center sm:py-14">
          <Logo aria-hidden="true" className="h-20 w-20" />
          <h2 className="text-xl! text-mint-600">Let’s meet the team</h2>
          <p className="text-sm!">
            Add your staff and Colonder can start building schedules.
          </p>
          <Button onClick={() => navigate('/staff/new')}>
            <i className="bi bi-plus-lg mr-2" aria-hidden="true" />
            Add staff
          </Button>
        </div>
      ) : (
        <>
          {upcomingCardsCount > 0 && (
            <section className="flex flex-col gap-3" aria-labelledby="up-next-heading">
              <h2 id="up-next-heading">Up next</h2>
              <div
                className={`grid min-w-0 grid-cols-1 gap-4 ${
                  upcomingCardsCount > 1 ? 'lg:grid-cols-2' : ''
                }`}
              >
                {showNextSixWeek && (
                  <div className="card w-full flex-row items-center border-mint-300 bg-mint-100">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-mint-600">
                      <i className="bi bi-calendar-plus text-lg" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-mint-600">
                        Create next six-week schedule
                      </h3>
                      <p className="text-sm text-grey-900">
                        {dateLabel(nextSixWeekStart)} – {dateLabel(nextSixWeekEnd)}{' '}
                        {startsIn(nextSixWeekDays)}.
                      </p>
                    </div>
                    <IconButton
                      ariaLabel="Create next six-week schedule"
                      title="Create next six-week schedule"
                      icon="bi-arrow-repeat"
                      variant="filled"
                      onClick={() => navigate('/new')}
                    />
                  </div>
                )}
                {showNextWeekly && upcomingWeek && (
                  <div className="card w-full flex-row items-center border-mint-300 bg-mint-100">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-mint-600">
                      <i className="bi bi-calendar-plus text-lg" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-mint-600">
                        Time to generate next week
                      </h3>
                      <p className="text-sm text-grey-900">
                        Week of {dateLabel(upcomingWeek.week.start)} –{' '}
                        {dateLabel(upcomingWeek.week.end)} {startsIn(upcomingWeekDays)}.
                      </p>
                    </div>
                    <IconButton
                      ariaLabel="Generate next weekly schedule"
                      title="Generate next weekly schedule"
                      icon="bi-arrow-repeat"
                      variant="filled"
                      onClick={() =>
                        navigate(
                          `/schedules/${upcomingWeek.segment.id}/weekly/${upcomingWeek.week.start}`,
                        )
                      }
                    />
                  </div>
                )}
              </div>
            </section>
          )}
          <h2 className="mt-1">Current schedules</h2>
          {!segment || !currentWeek ? (
            <div className="card w-full items-start">
              <h2>No current six-week schedule</h2>
              <p>There is no confirmed schedule covering today.</p>
            </div>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="card w-full min-w-0" aria-label="Current six-week schedule">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-grey-900">
                  Current six-week schedule
                </h3>
                <p className="mt-1 text-sm text-grey-600">
                  {dateLabel(segment.startDate, true)} – {dateLabel(segment.endDate, true)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <IconButton
                  ariaLabel="Print six-week schedule"
                  title="Print six-week schedule"
                  icon="bi-printer"
                  variant="outlined"
                  onClick={() =>
                    routeToScheduleAction(
                      `Schedule ${segment.startDate} - ${segment.endDate}.pdf`,
                      `/schedules/${segment.id}`,
                      'print',
                    )
                  }
                />
                <IconButton
                  ariaLabel="Download six-week schedule"
                  title="Download six-week schedule"
                  icon="bi-download"
                  variant="outlined"
                  onClick={() =>
                    routeToScheduleAction(
                      `Schedule ${segment.startDate} - ${segment.endDate}.pdf`,
                      `/schedules/${segment.id}`,
                      'download',
                    )
                  }
                />
                <IconButton
                  ariaLabel="Open six-week schedule details"
                  title="Open six-week schedule details"
                  icon="bi-arrow-up-right"
                  variant="outlined"
                  onClick={() => navigate(`/schedules/${segment.id}`)}
                />
              </div>
            </div>

            <div className="flex gap-1" aria-label={`Week ${currentWeekIndex + 1} of ${weeks.length}`}>
              {weeks.map((week, index) => (
                <span
                  key={week.start}
                  aria-label={`Week ${index + 1}${index === currentWeekIndex ? ', current week' : ''}`}
                  className={`h-2 flex-1 rounded-full ${
                    index < currentWeekIndex
                      ? 'bg-mint-600'
                      : index === currentWeekIndex
                        ? 'bg-mint-600 ring-2 ring-mint-100 ring-offset-1'
                        : 'bg-grey-50'
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-bold text-grey-900">
                Week {currentWeekIndex + 1} of {weeks.length}
              </span>
              <span className="text-grey-600">
                Ends {weekdayLabel(segment.endDate)}, {dateLabel(segment.endDate, true)}
              </span>
            </div>
          </section>

          <section className="card w-full min-w-0" aria-label="This week schedule">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-grey-900">This week</h3>
                <p className="mt-1 text-sm text-grey-600">
                  {dateLabel(currentWeek.start)} – {dateLabel(currentWeek.end)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <IconButton
                  ariaLabel="Print weekly schedule"
                  title="Print weekly schedule"
                  icon="bi-printer"
                  variant="outlined"
                  onClick={() =>
                    routeToScheduleAction(
                      `Weekly schedule ${currentWeek.start} - ${currentWeek.end}.pdf`,
                      `/schedules/${segment.id}/weekly/${currentWeek.start}`,
                      'print',
                    )
                  }
                />
                <IconButton
                  ariaLabel="Download weekly schedule"
                  title="Download weekly schedule"
                  icon="bi-download"
                  variant="outlined"
                  onClick={() =>
                    routeToScheduleAction(
                      `Weekly schedule ${currentWeek.start} - ${currentWeek.end}.pdf`,
                      `/schedules/${segment.id}/weekly/${currentWeek.start}`,
                      'download',
                    )
                  }
                />
                <IconButton
                  ariaLabel="Open weekly schedule details"
                  title="Open weekly schedule details"
                  icon="bi-arrow-up-right"
                  variant="outlined"
                  onClick={() =>
                    navigate(`/schedules/${segment.id}/weekly/${currentWeek.start}`)
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {currentWeek.dates.map((date) => (
                <div
                  key={date}
                  className={`flex min-w-0 flex-col items-center rounded-xl px-1 py-2 ${
                    date === today ? 'bg-mint-600 text-white' : 'bg-mint-50 text-grey-900'
                  }`}
                >
                  <span className="text-xs">{weekdayLabel(date)}</span>
                  <span className="text-sm font-bold">{dateLabel(date).split(' ')[1]}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-grey-600">
              {todaySummary
                ? `Today: ${todaySummary.nurses} nurses and ${todaySummary.techs} techs. First start ${todaySummary.firstStart ?? 'not scheduled'}.`
                : 'No staffing details are available for today.'}
            </p>
          </section>
            </div>
          )}
        </>
      )}
    </PageContent>
  );
};

export default Dashboard;
