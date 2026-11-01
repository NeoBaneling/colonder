import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Dept, type ScheduleSegment, type WeeklyAssignment, type WeeklySchedule } from '@app/types';
import { Button } from '../inputs/Button';
import { TimePicker } from '../inputs/TimePicker';
import { formatTime } from '../inputs/time';
import { PageContent } from '../layout/PageContent';
import { useToast } from '../layout/Toast';
import { getSegmentWeeks } from '../../../weekly';
import { PrintFooter } from './PrintFooter';
import { fmtDept } from '../util';

type SelectedAssignment = {
  key: string;
  left: number;
  name: string;
  time: string;
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

const assignmentKey = (assignment: WeeklyAssignment) =>
  `${assignment.date}:${assignment.staffId}`;

const assignmentsEqual = (
  left: WeeklyAssignment[],
  right: WeeklyAssignment[],
) => {
  if (left.length !== right.length) return false;
  const sortByKey = (a: WeeklyAssignment, b: WeeklyAssignment) =>
    assignmentKey(a).localeCompare(assignmentKey(b));
  const sortedLeft = [...left].sort(sortByKey);
  const sortedRight = [...right].sort(sortByKey);
  return sortedLeft.every((assignment, index) => {
    const saved = sortedRight[index];
    return (
      assignmentKey(assignment) === assignmentKey(saved) &&
      assignment.department === saved.department &&
      assignment.room === saved.room &&
      assignment.startTime === saved.startTime
    );
  });
};

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
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const { scheduleId, weekStart } = useParams();
  const [segment, setSegment] = useState<ScheduleSegment | null>(null);
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [assignments, setAssignments] = useState<WeeklyAssignment[]>([]);
  const [draggedAssignmentKey, setDraggedAssignmentKey] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [invalidDropTargetKey, setInvalidDropTargetKey] = useState<string | null>(
    null,
  );
  const [selected, setSelected] = useState<SelectedAssignment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dashboardActionHandled = useRef(false);
  const navigationState =
    typeof location.state === 'object' && location.state !== null
      ? location.state
      : null;
  const dashboardAction =
    navigationState && 'dashboardAction' in navigationState
      ? navigationState.dashboardAction
      : null;
  const dashboardFilename =
    navigationState && 'filename' in navigationState
      ? navigationState.filename
      : null;

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
  const hasChanges = schedule !== null && !assignmentsEqual(
    assignments,
    schedule.assignments,
  );
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
  const draggedAssignment = assignments.find(
    (assignment) => assignmentKey(assignment) === draggedAssignmentKey,
  );
  const draggedPerson = draggedAssignment
    ? staffById.get(draggedAssignment.staffId)
    : undefined;
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
      left: bounds.left,
      name: `${person.firstName} ${person.lastName}`,
      time: assignment.startTime,
    });
  };

  const closeEditor = () => setSelected(null);

  const updateStartTime = (startTime: string) => {
    if (!selected) return;
    setAssignments((current) =>
      current.map((assignment) =>
        assignmentKey(assignment) === selected.key
          ? { ...assignment, startTime }
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
      setInvalidDropTargetKey(null);
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
    setDraggedAssignmentKey(null);
    setDropTargetKey(null);
    setInvalidDropTargetKey(null);
  };

  const confirmSchedule = async () => {
    if (!schedule) return;
    setIsSaving(true);
    setError(null);
    try {
      const saved = await window.weeklySchedules.save(
        schedule.id,
        assignments,
        true,
      );
      setSchedule(saved);
      setAssignments(saved.assignments);
      toast.success(
        'Weekly schedule confirmed',
        'Your weekly schedule is up to date.',
      );
    } catch (saveError: unknown) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : 'Unable to save the weekly schedule.';
      setError(message);
      toast.failure("Couldn't confirm weekly schedule", message);
    } finally {
      setIsSaving(false);
    }
  };

  const downloadSchedule = async (filename?: string) => {
    if (!currentWeek) return;
    setError(null);
    try {
      await window.schedules.downloadPdf(
        filename ?? `Weekly schedule ${currentWeek.start} - ${currentWeek.end}.pdf`,
      );
    } catch (downloadError: unknown) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : 'Unable to download the weekly schedule.',
      );
    }
  };

  useEffect(() => {
    if (isLoading || !segment || !currentWeek || dashboardActionHandled.current) {
      return;
    }
    if (dashboardAction !== 'print' && dashboardAction !== 'download') return;
    dashboardActionHandled.current = true;
    if (dashboardAction === 'print') {
      window.print();
    } else {
      void downloadSchedule(
        typeof dashboardFilename === 'string' ? dashboardFilename : undefined,
      );
    }
  }, [currentWeek, dashboardAction, dashboardFilename, isLoading, segment]);

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
                      const invalidDepartmentMessage =
                        draggedAssignment?.date === date &&
                        draggedPerson &&
                        !draggedPerson.departments.includes(
                          department.department,
                        )
                          ? `${draggedPerson.firstName} ${draggedPerson.lastName} can't work in ${fmtDept(department.department)}`
                          : undefined;
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
                            const targetKey = `${department.key}:${date}`;
                            if (canDropAssignment(draggedAssignmentKey, date, department.department)) {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'move';
                              setDropTargetKey(targetKey);
                              setInvalidDropTargetKey(null);
                            } else if (invalidDepartmentMessage) {
                              event.dataTransfer.dropEffect = 'none';
                              setDropTargetKey(null);
                              setInvalidDropTargetKey(targetKey);
                            } else {
                              setDropTargetKey(null);
                              setInvalidDropTargetKey(null);
                            }
                          }}
                          onDragLeave={(event) => {
                            const relatedTarget = event.relatedTarget;
                            if (
                              !(relatedTarget instanceof Node) ||
                              !event.currentTarget.contains(relatedTarget)
                            ) {
                              setDropTargetKey(null);
                              setInvalidDropTargetKey(null);
                            }
                          }}
                          onDrop={(event) =>
                            handleAssignmentDrop(event, date, department)
                          }
                        >
                          <div
                            className={[
                              'weekly-assignment-list',
                              invalidDropTargetKey === `${department.key}:${date}`
                                ? 'weekly-drop-not-allowed'
                                : '',
                            ].filter(Boolean).join(' ')}
                            data-tooltip={
                              invalidDropTargetKey === `${department.key}:${date}`
                                ? invalidDepartmentMessage
                                : undefined
                            }
                          >
                            {dayAssignments.map((assignment) => {
                              const person = staffById.get(assignment.staffId);
                              if (!person) return null;
                              const key = assignmentKey(assignment);
                              const personLabel = (
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
                              );
                              if (selected?.key === key) {
                                return (
                                  <div
                                    key={key}
                                    className="weekly-assignment weekly-assignment-editing"
                                  >
                                    {personLabel}
                                    <TimePicker
                                      name="weekly-start-time"
                                      label={`Start time · ${selected.name}`}
                                      value={selected.time}
                                      inline
                                      openOnMount
                                      popoverAnchorLeft={selected.left}
                                      className="weekly-assignment-time time-picker-inline"
                                      onChange={updateStartTime}
                                      onCancel={closeEditor}
                                    />
                                  </div>
                                );
                              }
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  draggable
                                  className={`weekly-assignment${draggedAssignmentKey === key ? ' weekly-assignment-dragging' : ''}`}
                                  onDragStart={(event) => {
                                    event.dataTransfer.setData('text/plain', key);
                                    event.dataTransfer.effectAllowed = 'move';
                                    setDraggedAssignmentKey(key);
                                    setSelected(null);
                                  }}
                                  onDragEnd={() => {
                                    setDraggedAssignmentKey(null);
                                    setDropTargetKey(null);
                                    setInvalidDropTargetKey(null);
                                  }}
                                  onClick={(event) => openEditor(event, assignment)}
                                  aria-label={`Edit ${person.firstName} ${person.lastName} start time for ${weekdayLabel(date)}, ${dateLabel(date)}`}
                                >
                                  {personLabel}
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
          {error && <p role="alert">{error}</p>}
          <div className="weekly-print-actions flex justify-end">
            <Button
              onClick={() => void confirmSchedule()}
              disabled={isSaving || !hasChanges}
            >
              {isSaving ? 'Saving…' : 'Confirm'}
            </Button>
          </div>
          <PrintFooter pageNumber={1} totalPages={1} />
        </div>
      ) : (
        <p role="alert">{error ?? 'This weekly schedule could not be found.'}</p>
      )}

    </PageContent>
  );
};

export default WeeklyDetailPage;
