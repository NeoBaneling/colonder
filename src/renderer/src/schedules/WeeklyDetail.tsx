import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type MouseEvent,
} from 'react';
import { useNavigate, useParams } from 'react-router';
import { Dept, type ScheduleSegment, type WeeklyAssignment, type WeeklySchedule } from '@app/types';
import { Button } from '../inputs/Button';
import { PageContent } from '../layout/PageContent';
import { getSegmentWeeks } from '../../../weekly';
import { PrintFooter } from './PrintFooter';

type SelectedAssignment = {
  key: string;
  name: string;
  top: number;
  left: number;
};

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));

const weekdayLabel = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));

const formatTime = (time: string) => {
  const [hoursText, minutes] = time.split(':');
  const hours = Number(hoursText);
  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
};

const timeOptions = (currentTime: string) => {
  const times = new Set<string>();
  for (let minutes = 6 * 60; minutes <= 10 * 60; minutes += 30) {
    times.add(
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
    );
  }
  times.add(currentTime);
  return [...times].sort();
};

const assignmentKey = (assignment: WeeklyAssignment) =>
  `${assignment.date}:${assignment.staffId}`;

const departmentRows = (segment: ScheduleSegment) => [
  { key: `dept-${Dept.PRE}`, label: 'PREOP', department: Dept.PRE, room: null, sectionEnd: true },
  { key: `dept-${Dept.PACU}`, label: 'PACU', department: Dept.PACU, room: null, sectionEnd: true },
  ...Array.from(
    { length: segment.state.settingsSnapshot.procRooms },
    (_, index) => ({
      key: `dept-${Dept.PROC}-${index + 1}`,
      label: `PR ${index + 1}`,
      department: Dept.PROC,
      room: index + 1,
      sectionEnd: false,
    }),
  ),
];

export const WeeklyDetailPage = () => {
  const navigate = useNavigate();
  const { scheduleId, weekStart } = useParams();
  const [segment, setSegment] = useState<ScheduleSegment | null>(null);
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [assignments, setAssignments] = useState<WeeklyAssignment[]>([]);
  const [draggedAssignmentKey, setDraggedAssignmentKey] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedAssignment | null>(null);
  const [draftStartTime, setDraftStartTime] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadWeeklySchedule = async () => {
      if (!scheduleId || !weekStart) {
        setError('A schedule and week are required.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      setSelected(null);
      try {
        const savedSegments = await window.segments.list();
        const match = savedSegments.find((item) => item.id === Number(scheduleId));
        if (!match) throw new Error('This schedule could not be found.');
        const week = getSegmentWeeks(match).find(
          (item) => item.start === weekStart,
        );
        if (!week) {
          throw new Error('This week does not belong to the selected schedule.');
        }

        const weeklySchedule = await window.weeklySchedules.getOrCreate(
          match.id,
          weekStart,
        );
        if (!active) return;
        setSegment(match);
        setSchedule(weeklySchedule);
        setAssignments(weeklySchedule.assignments);
      } catch (loadError: unknown) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load the weekly schedule.',
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadWeeklySchedule();
    return () => {
      active = false;
    };
  }, [scheduleId, weekStart]);

  const weeks = useMemo(
    () => (segment ? getSegmentWeeks(segment) : []),
    [segment],
  );
  const currentWeek = weeks.find((week) => week.start === weekStart) ?? null;
  const departments = useMemo(
    () => (segment ? departmentRows(segment) : []),
    [segment],
  );
  const staffById = useMemo(
    () =>
      new Map(
        (segment?.state.staffSnapshot ?? []).map((person) => [person.id, person]),
      ),
    [segment],
  );
  const groupedAssignments = useMemo(() => {
    const groups = new Map<string, WeeklyAssignment[]>();
    for (const department of departments) {
      for (const date of currentWeek?.dates ?? []) {
        groups.set(`${department.key}:${date}`, []);
      }
    }
    for (const assignment of assignments) {
      const department = departments.find(
        (candidate) =>
          candidate.department === assignment.department &&
          candidate.room === assignment.room,
      );
      if (!department) continue;
      groups.get(`${department.key}:${assignment.date}`)?.push(assignment);
    }
    for (const group of groups.values()) {
      group.sort((a, b) => {
        const personA = staffById.get(a.staffId);
        const personB = staffById.get(b.staffId);
        return (
          (personA?.lastName ?? '').localeCompare(personB?.lastName ?? '') ||
          (personA?.firstName ?? '').localeCompare(personB?.firstName ?? '')
        );
      });
    }
    return groups;
  }, [assignments, currentWeek, departments, staffById]);

  const openEditor = (
    event: MouseEvent<HTMLButtonElement>,
    assignment: WeeklyAssignment,
  ) => {
    const person = staffById.get(assignment.staffId);
    if (!person) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setSelected({
      key: assignmentKey(assignment),
      name: `${person.firstName} ${person.lastName}`,
      top: Math.min(bounds.bottom + 8, Math.max(12, window.innerHeight - 190)),
      left: Math.max(12, Math.min(bounds.left, window.innerWidth - 280)),
    });
    setDraftStartTime(assignment.startTime);
    setNotice(null);
  };

  const closeEditor = () => setSelected(null);

  const updateStartTime = () => {
    if (!selected) return;
    setAssignments((current) =>
      current.map((assignment) =>
        assignmentKey(assignment) === selected.key
          ? { ...assignment, startTime: draftStartTime }
          : assignment,
      ),
    );
    setSelected(null);
  };

  const canDropAssignment = (
    draggedKey: string | null,
    date: string,
    department: Dept,
  ) => {
    if (!draggedKey) return false;
    const assignment = assignments.find(
      (candidate) => assignmentKey(candidate) === draggedKey,
    );
    const person = assignment && staffById.get(assignment.staffId);
    return Boolean(
      assignment &&
        person &&
        assignment.date === date &&
        person.departments.includes(department),
    );
  };

  const handleAssignmentDrop = (
    event: DragEvent<HTMLTableCellElement>,
    date: string,
    department: (typeof departments)[number],
  ) => {
    event.preventDefault();
    const key = event.dataTransfer.getData('text/plain') || draggedAssignmentKey;
    if (!canDropAssignment(key, date, department.department) || !key) {
      setDraggedAssignmentKey(null);
      setDropTargetKey(null);
      return;
    }

    setAssignments((current) =>
      current.map((assignment) =>
        assignmentKey(assignment) === key
          ? {
              ...assignment,
              department: department.department,
              room: department.room,
            }
          : assignment,
      ),
    );
    setNotice('Assignment updated. Confirm to save your changes.');
    setDraggedAssignmentKey(null);
    setDropTargetKey(null);
  };

  const confirmSchedule = async () => {
    if (!schedule) return;
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await window.weeklySchedules.save(
        schedule.id,
        assignments,
        true,
      );
      setSchedule(saved);
      setAssignments(saved.assignments);
      setNotice(null);
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to save the weekly schedule.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const downloadSchedule = async () => {
    if (!currentWeek) return;
    setError(null);
    try {
      await window.schedules.downloadPdf(
        `Weekly schedule ${currentWeek.start} - ${currentWeek.end}.pdf`,
      );
    } catch (downloadError: unknown) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : 'Unable to download the weekly schedule.',
      );
    }
  };

  return (
    <PageContent
      title="Weekly schedule"
      canReturn
      actions={[
        {
          ariaLabel: 'Print weekly schedule',
          icon: 'bi-printer',
          variant: 'outlined',
          onClick: () => window.print(),
        },
        {
          ariaLabel: 'Download weekly schedule',
          icon: 'bi-download',
          variant: 'outlined',
          onClick: () => void downloadSchedule(),
        },
      ]}
    >
      {isLoading ? (
        <p role="status">Loading weekly schedule…</p>
      ) : error && !segment ? (
        <p role="alert">{error}</p>
      ) : segment && currentWeek ? (
        <div className="weekly-print-page flex min-w-0 flex-col gap-4">
          <h2 className="weekly-pdf-heading">
            Week of {dateLabel(currentWeek.start)} – {dateLabel(currentWeek.end)},{' '}
            {currentWeek.end.slice(0, 4)}
          </h2>
          <label className="flex items-center gap-2 text-sm font-semibold text-grey-900">
            Week of
            <select
              aria-label="Week of"
              value={weekStart}
              onChange={(event) =>
                navigate(`/schedules/${segment.id}/weekly/${event.target.value}`)
              }
              className="min-w-40 rounded-lg border border-grey-200 bg-white px-3 py-2 text-sm"
            >
              {weeks.map((week) => (
                <option key={week.start} value={week.start}>
                  {dateLabel(week.start)} - {dateLabel(week.end)}
                </option>
              ))}
            </select>
          </label>

          <div className="weekly-schedule-scroll">
            <table className="weekly-schedule-grid">
              <thead>
                <tr>
                  <th aria-hidden="true" />
                  {currentWeek.dates.map((date, index) => (
                    <th
                      key={date}
                      scope="col"
                      className={index % 2 === 1 ? 'weekly-day-shaded' : ''}
                    >
                      <span>{weekdayLabel(date)}</span>
                      <span className="weekly-date-label">{dateLabel(date)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {departments.map((department) => (
                  <tr
                    key={department.key}
                    className={department.sectionEnd ? 'weekly-section-divider' : ''}
                  >
                    <th scope="row">{department.label}</th>
                    {currentWeek.dates.map((date, index) => {
                      const dayAssignments =
                        groupedAssignments.get(`${department.key}:${date}`) ?? [];
                      return (
                        <td
                          key={date}
                          className={[
                            index % 2 === 1 ? 'weekly-day-shaded' : '',
                            dropTargetKey === `${department.key}:${date}`
                              ? 'weekly-drop-target'
                              : '',
                          ].filter(Boolean).join(' ')}
                          onDragOver={(event) => {
                            if (
                              canDropAssignment(
                                draggedAssignmentKey,
                                date,
                                department.department,
                              )
                            ) {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'move';
                              setDropTargetKey(`${department.key}:${date}`);
                            }
                          }}
                          onDragLeave={(event) => {
                            if (event.currentTarget === event.target) {
                              setDropTargetKey(null);
                            }
                          }}
                          onDrop={(event) =>
                            handleAssignmentDrop(event, date, department)
                          }
                        >
                          <div className="weekly-assignment-list">
                            {dayAssignments.map((assignment) => {
                              const person = staffById.get(assignment.staffId);
                              if (!person) return null;
                              return (
                                <button
                                  key={assignmentKey(assignment)}
                                  type="button"
                                  draggable
                                  className={`weekly-assignment${draggedAssignmentKey === assignmentKey(assignment) ? ' weekly-assignment-dragging' : ''}`}
                                  onDragStart={(event) => {
                                    const key = assignmentKey(assignment);
                                    event.dataTransfer.setData('text/plain', key);
                                    event.dataTransfer.effectAllowed = 'move';
                                    setDraggedAssignmentKey(key);
                                    setSelected(null);
                                  }}
                                  onDragEnd={() => {
                                    setDraggedAssignmentKey(null);
                                    setDropTargetKey(null);
                                  }}
                                  onClick={(event) => openEditor(event, assignment)}
                                  aria-label={`Edit ${person.firstName} ${person.lastName} start time for ${weekdayLabel(date)}, ${dateLabel(date)}`}
                                >
                                  <span className="weekly-assignment-person">
                                    <span>
                                      {person.lastName} {person.firstName.slice(0, 1)}.
                                    </span>
                                    {person.isLeader && (
                                      <span
                                        role="img"
                                        className="weekly-marker weekly-marker-leader"
                                        aria-label="Leader"
                                        title="Leader"
                                      />
                                    )}
                                    {person.inOrientation && (
                                      <span
                                        role="img"
                                        className="weekly-marker weekly-marker-orientation"
                                        aria-label="In orientation"
                                        title="In orientation"
                                      />
                                    )}
                                  </span>
                                  <span className="weekly-assignment-time">
                                    {formatTime(assignment.startTime)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          <div className="weekly-print-actions flex justify-end">
            <Button onClick={() => void confirmSchedule()} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Confirm'}
            </Button>
          </div>
          <PrintFooter pageNumber={1} totalPages={1} />
        </div>
      ) : (
        <p role="alert">{error ?? 'This weekly schedule could not be found.'}</p>
      )}

      {selected && (
        <div
          className="weekly-editor-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditor();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeEditor();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Edit start time for ${selected.name}`}
            className="weekly-time-editor"
            style={{ top: selected.top, left: selected.left }}
          >
            <label className="flex flex-col gap-2 text-sm font-bold text-grey-900">
              Start time · {selected.name}
              <select
                autoFocus
                value={draftStartTime}
                onChange={(event) => setDraftStartTime(event.target.value)}
              >
                {timeOptions(draftStartTime).map((time) => (
                  <option key={time} value={time}>
                    {formatTime(time)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outlined" onClick={closeEditor} className="min-h-9 px-3 text-sm">
                Cancel
              </Button>
              <Button onClick={updateStartTime} className="min-h-9 px-3 text-sm">
                Done
              </Button>
            </div>
          </section>
        </div>
      )}
    </PageContent>
  );
};

export default WeeklyDetailPage;
