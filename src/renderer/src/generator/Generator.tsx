import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  useBlocker,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import {
  Emp,
  Role,
  type ScheduleSegment,
  type SegmentState,
  type SegmentStep,
  type SegmentWarning,
  type Settings,
  type Staff,
} from '../../../types';
import { Button } from '../inputs/Button';
import { Dialog } from '../layout/Dialog';
import { PageContent } from '../layout/PageContent';
import {
  cellKey,
  dailyCounts,
  dayLabel,
  generateSegmentShifts,
  getSegmentDates,
  nextWorkingStart,
  segmentEndDate,
  validateSegment,
  weekIndex,
} from './engine';

type View = 'pto' | 'prn' | 'generating' | 'review';
type ReviewEdit = Pick<SegmentState, 'shifts' | 'onCall'>;

const formatDate = (date: string): string =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));

const formatDateRange = (startDate: string, endDate: string): string =>
  `${formatDate(startDate)} – ${formatDate(endDate)}, ${endDate.slice(0, 4)}`;

const weekGroups = (dates: string[], startDate: string) => {
  const groups: { week: number; dates: string[] }[] = [];
  for (const date of dates) {
    const week = weekIndex(startDate, date);
    const last = groups[groups.length - 1];
    if (last?.week === week) last.dates.push(date);
    else groups.push({ week, dates: [date] });
  }
  return groups;
};

const sortedStaff = (staff: Staff[]): Staff[] =>
  [...staff].sort((a, b) => {
    if (a.role !== b.role) return a.role - b.role;
    return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
  });

const moveGridFocus = (
  event: ReactKeyboardEvent<HTMLButtonElement>,
  rowIndex: number,
  columnIndex: number,
) => {
  const movement: Record<string, [number, number]> = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  };
  const direction = movement[event.key];
  if (!direction) return;

  const table = event.currentTarget.closest('table');
  if (!table) return;
  event.preventDefault();
  let row = rowIndex + direction[0];
  let column = columnIndex + direction[1];
  while (row >= 0 && column >= 0) {
    const next = table.querySelector<HTMLButtonElement>(
      `[data-grid-row="${row}"][data-grid-column="${column}"]`,
    );
    if (!next) return;
    if (!next.disabled) {
      next.focus();
      return;
    }
    row += direction[0];
    column += direction[1];
  }
};

type InputGridProps = {
  title: string;
  instructions: string;
  staff: Staff[];
  dates: string[];
  startDate: string;
  selected: Set<string>;
  disabledKeys?: Set<string>;
  kind: 'pto' | 'prn';
  onToggle: (key: string, value: boolean) => void;
};

const InputGrid = ({
  title,
  instructions,
  staff,
  dates,
  startDate,
  selected,
  disabledKeys,
  kind,
  onToggle,
}: InputGridProps) => {
  const [paintValue, setPaintValue] = useState<boolean | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const groups = weekGroups(dates, startDate);
  const people = sortedStaff(staff);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="text-sm! sm:text-base!">
        {title} <span className="font-normal">({instructions})</span>
      </h2>
      {people.length === 0 ? (
        <p className="text-sm!">No staff members in this group.</p>
      ) : (
        <div
          className="schedule-grid-scroll"
          data-scrolled={isScrolled}
          onScroll={(event) =>
            setIsScrolled(event.currentTarget.scrollLeft > 0)
          }
          onPointerUp={() => setPaintValue(null)}
          onPointerLeave={() => setPaintValue(null)}
        >
          <table className="schedule-grid input-grid">
            <thead>
              <tr>
                <th className="schedule-name-cell" rowSpan={2} scope="col">
                  Staff
                </th>
                {groups.map((group) => (
                  <th
                    key={group.week}
                    className="schedule-week-cell"
                    colSpan={group.dates.length}
                    scope="colgroup"
                  >
                    Week {group.week + 1}
                  </th>
                ))}
              </tr>
              <tr>
                {dates.map((date) => (
                  <th
                    className="schedule-day-cell"
                    key={date}
                    id={`day-${date}`}
                    scope="col"
                    title={formatDate(date)}
                  >
                    {dayLabel(date).slice(0, 1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((person, rowIndex) => (
                <tr key={person.id}>
                  <th className="schedule-name-cell" scope="row">
                    <span className="schedule-staff-label">
                      {person.lastName}, {person.firstName.slice(0, 1)}.
                    </span>
                  </th>
                  {dates.map((date, columnIndex) => {
                    const key = cellKey(person.id, date);
                    const isSelected = selected.has(key);
                    const isDisabled = disabledKeys?.has(key) ?? false;
                    return (
                      <td key={date}>
                        <button
                          type="button"
                          aria-label={`${person.firstName} ${person.lastName}, ${formatDate(date)}: ${isDisabled ? 'unavailable due to PTO' : isSelected ? 'selected' : 'not selected'}`}
                          aria-pressed={isSelected}
                          disabled={isDisabled}
                          data-grid-row={rowIndex}
                          data-grid-column={columnIndex}
                          className={`schedule-cell ${isSelected ? kind === 'pto' ? 'schedule-cell-pto' : 'schedule-cell-prn' : ''}`}
                          onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            event.preventDefault();
                            const nextValue = !isSelected;
                            setPaintValue(nextValue);
                            onToggle(key, nextValue);
                          }}
                          onPointerEnter={() => {
                            if (paintValue !== null) onToggle(key, paintValue);
                          }}
                          onClick={(event) => {
                            if (event.detail === 0) onToggle(key, !isSelected);
                          }}
                          onKeyDown={(event) =>
                            moveGridFocus(event, rowIndex, columnIndex)
                          }
                        >
                          {isSelected ? (kind === 'pto' ? 'P' : '✓') : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {title === 'PTO calendar' && (
              <tfoot>
                <tr>
                  <th className="schedule-name-cell" scope="row">
                    PTO
                  </th>
                  {dates.map((date) => (
                    <td key={date}>
                      <span className="schedule-total">
                        {people.filter((person) =>
                          selected.has(cellKey(person.id, date)),
                        ).length}
                      </span>
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
};

const warningLabel = (warning: SegmentWarning) => warning.message;

const GeneratorPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { scheduleId: editParam } = useParams();
  const draftParam = searchParams.get('draft');
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [segments, setSegments] = useState<ScheduleSegment[]>([]);
  const [state, setState] = useState<SegmentState | null>(null);
  const [draftId, setDraftId] = useState<number | null>(null);
  const draftCreation = useRef<Promise<ScheduleSegment> | null>(null);
  const [editScheduleId, setEditScheduleId] = useState<number | null>(null);
  const [view, setView] = useState<View>('pto');
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingError, setSavingError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [onCallMode, setOnCallMode] = useState(false);
  const [selectedWork, setSelectedWork] = useState<{
    staffId: number;
    date: string;
  } | null>(null);
  const [undoStack, setUndoStack] = useState<ReviewEdit[]>([]);
  const [redoStack, setRedoStack] = useState<ReviewEdit[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [showBackReview, setShowBackReview] = useState(false);
  const [reviewGridScrolled, setReviewGridScrolled] = useState(false);
  const hasDraftProgress =
    state !== null &&
    (view === 'review' ||
      view === 'generating' ||
      state.ptoDates.length > 0 ||
      state.prnDates.length > 0);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      editScheduleId === null &&
      hasDraftProgress &&
      !isWorking &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  const createDraft = (draftState: SegmentState) => {
    if (draftCreation.current === null) {
      const creation = window.segments.create(draftState);
      draftCreation.current = creation;
      void creation.catch(() => {
        if (draftCreation.current === creation) draftCreation.current = null;
      });
    }
    return draftCreation.current;
  };

  useEffect(() => {
    let active = true;
    Promise.all([window.staff.list(), window.settings.get(), window.segments.list()])
      .then(([staffMembers, savedSettings, savedSegments]) => {
        if (!active) return;
        const activeStaff = staffMembers;
        setStaff(activeStaff);
        setSettings(savedSettings);
        setSegments(savedSegments);
        if (editParam) {
          const schedule = savedSegments.find(
            (segment) =>
              segment.id === Number(editParam) &&
              segment.status === 'confirmed',
          );
          if (!schedule) {
            setLoadError('This confirmed schedule could not be found.');
          } else {
            setState({ ...schedule.state, step: 'review' });
            setEditScheduleId(schedule.id);
            setView('review');
          }
        } else if (draftParam) {
          const draft = savedSegments.find(
            (segment) =>
              segment.id === Number(draftParam) && segment.status === 'draft',
          );
          if (!draft) {
            setLoadError('This schedule draft could not be found.');
          } else {
            setState(draft.state);
            setDraftId(draft.id);
            setView(draft.state.step);
          }
        } else {
          const startDate = nextWorkingStart(
            savedSettings.workingDays,
            savedSegments
              .filter((segment) => segment.status === 'confirmed')
              .map((segment) => segment.endDate),
          );
          if (!startDate) {
            setLoadError('Choose at least one working day in Settings before creating a schedule.');
            return;
          }

          const initial: SegmentState = {
            step: 'pto',
            startDate,
            endDate: segmentEndDate(startDate, savedSettings.workingDays),
            ptoDates: [],
            prnDates: [],
            shifts: [],
            onCall: [],
            staffSnapshot: staffMembers,
            settingsSnapshot: savedSettings,
            seed: Date.now() % 1000003,
            hasManualEdits: false,
          };
          setState(initial);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setLoadError(
            reason instanceof Error ? reason.message : 'Unable to load schedule data.',
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [draftParam, editParam]);

  useEffect(() => {
    if (
      state === null ||
      editScheduleId !== null ||
      isWorking ||
      !hasDraftProgress
    ) {
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      const persist = async () => {
        try {
          let saved: ScheduleSegment;
          if (draftId !== null) {
            saved = await window.segments.saveDraft(draftId, state);
          } else {
            saved = await createDraft(state);
            if (active) setDraftId(saved.id);
          }
          if (!active) return;
          setSegments((current) =>
            current.some((segment) => segment.id === saved.id)
              ? current.map((segment) =>
                  segment.id === saved.id ? saved : segment,
                )
              : [saved, ...current],
          );
          setSavingError(null);
        } catch (reason) {
          if (active) {
            setSavingError(
              reason instanceof Error
                ? reason.message
                : 'Unable to save schedule draft.',
            );
          }
        }
      };
      void persist();
    }, 500);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [draftId, editScheduleId, hasDraftProgress, isWorking, state]);

  const dates = useMemo(
    () =>
      state && settings
        ? getSegmentDates(state.startDate, state.settingsSnapshot.workingDays)
        : [],
    [settings, state],
  );
  const people = useMemo(
    () => sortedStaff(state?.staffSnapshot ?? staff ?? []),
    [staff, state?.staffSnapshot],
  );
  const prnStaff = useMemo(
    () => people.filter((person) => person.employment === Emp.PRN),
    [people],
  );
  const warnings = useMemo(
    () =>
      state
        ? validateSegment(
            state.staffSnapshot,
            dates,
            state.shifts,
            state.settingsSnapshot,
            state.onCall,
            state.startDate,
          )
        : [],
    [dates, state],
  );
  const offTargetDays = warnings.filter(
    (warning) => warning.code === 'DAY_UNDER_TARGET',
  ).length;
  const reviewCounts = state
    ? dates.map((date) =>
        dailyCounts(date, state.staffSnapshot, state.shifts),
      )
    : [];
  const countRange = (key: 'nurses' | 'techs', edge: 'min' | 'max') => {
    const counts = reviewCounts.map((count) => count[key]);
    if (counts.length === 0) return 0;
    return edge === 'min' ? Math.min(...counts) : Math.max(...counts);
  };
  const ptoSet = useMemo(() => new Set(state?.ptoDates ?? []), [state?.ptoDates]);
  const prnSet = useMemo(() => new Set(state?.prnDates ?? []), [state?.prnDates]);

  const updateMarkedDays = (field: 'ptoDates' | 'prnDates', key: string, value: boolean) => {
    setState((current) => {
      if (!current) return current;
      const values = new Set(current[field]);
      if (value) values.add(key);
      else values.delete(key);
      return { ...current, [field]: [...values] };
    });
  };

  const runGeneration = useCallback(
    (source: SegmentState) => {
      setView('generating');
      setSelectedWork(null);
      window.setTimeout(() => {
        const generated: SegmentState = {
          ...source,
          step: 'review',
          shifts: generateSegmentShifts(
            source.staffSnapshot,
            getSegmentDates(source.startDate, source.settingsSnapshot.workingDays),
            source.ptoDates,
            source.prnDates,
            source.startDate,
            source.seed,
          ),
          hasManualEdits: false,
        };
        setState(generated);
        setUndoStack([]);
        setRedoStack([]);
        setView('review');
      }, 120);
    },
    [],
  );

  const nextFromPto = () => {
    if (!state) return;
    if (prnStaff.length > 0) {
      const nextState: SegmentState = { ...state, step: 'prn' };
      setState(nextState);
      setView('prn');
    } else {
      runGeneration(state);
    }
  };

  const makeSwap = (staffId: number, workDate: string, offDate: string) => {
    if (!state) return;
    setUndoStack((history) => [
      ...history,
      { shifts: state.shifts, onCall: state.onCall },
    ]);
    setRedoStack([]);
    setState((current) => {
      if (!current) return current;
      const shifts = current.shifts.filter(
        (shift) =>
          !(
            shift.staffId === staffId &&
            shift.kind === 'work' &&
            (shift.date === workDate || shift.date === offDate)
          ),
      );
      const workShift = current.shifts.find(
        (shift) =>
          shift.staffId === staffId &&
          shift.date === workDate &&
          shift.kind === 'work',
      );
      if (!workShift) return current;
      shifts.push({ ...workShift, date: offDate });
      return { ...current, shifts, hasManualEdits: true };
    });
    setSelectedWork(null);
  };

  const toggleOnCall = (staffId: number, date: string) => {
    if (!state) return;
    const key = cellKey(staffId, date);
    const onCall = new Set(state.onCall);
    if (onCall.has(key)) onCall.delete(key);
    else onCall.add(key);
    setUndoStack((history) => [
      ...history,
      { shifts: state.shifts, onCall: state.onCall },
    ]);
    setRedoStack([]);
    setState({ ...state, onCall: [...onCall], hasManualEdits: true });
  };

  const returnToInputs = () => {
    if (!state) return;
    const previousStep = prnStaff.length > 0 ? 'prn' : 'pto';
    const nextState: SegmentState = {
      ...state,
      step: previousStep,
      shifts: [],
      onCall: [],
      hasManualEdits: false,
    };
    setState(nextState);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedWork(null);
    setShowBackReview(false);
    setView(previousStep);
  };

  const undo = useCallback(() => {
    if (!state || undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((stack) => [
      ...stack,
      { shifts: state.shifts, onCall: state.onCall },
    ]);
    setUndoStack((stack) => stack.slice(0, -1));
    setState({
      ...state,
      shifts: previous.shifts,
      onCall: previous.onCall,
      hasManualEdits: true,
    });
  }, [state, undoStack]);

  const redo = useCallback(() => {
    if (!state || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((stack) => [
      ...stack,
      { shifts: state.shifts, onCall: state.onCall },
    ]);
    setRedoStack((stack) => stack.slice(0, -1));
    setState({
      ...state,
      shifts: next.shifts,
      onCall: next.onCall,
      hasManualEdits: true,
    });
  }, [redoStack, state]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (view !== 'review') return;
      if (event.key === 'Escape') setSelectedWork(null);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        if (
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          (event.target instanceof HTMLElement && event.target.isContentEditable)
        ) {
          return;
        }
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [redo, undo, view]);

  const confirmSchedule = async () => {
    if (!state || (warnings.length > 0 && !acknowledged)) return;
    setIsWorking(true);
    try {
      let scheduleId = editScheduleId ?? draftId;
      if (scheduleId === null) {
        const draft = await createDraft(state);
        scheduleId = draft.id;
        setDraftId(draft.id);
      }
      const confirmed =
        editScheduleId !== null
          ? await window.segments.updateConfirmed(editScheduleId, state)
          : await window.segments.confirm(scheduleId, state);
      setSegments((current) => [
        confirmed,
        ...current.filter((segment) => segment.id !== confirmed.id),
      ]);
      setShowConfirm(false);
      navigate(`/schedules/${confirmed.id}`);
    } catch (reason) {
      setSavingError(
        reason instanceof Error ? reason.message : 'Unable to confirm this schedule.',
      );
    } finally {
      setIsWorking(false);
    }
  };

  const discardDraft = async () => {
    try {
      const pendingDraft =
        draftId === null ? await draftCreation.current : null;
      const idToDelete = draftId ?? pendingDraft?.id;
      if (idToDelete !== undefined && idToDelete !== null) {
        await window.segments.deleteDraft(idToDelete);
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to delete schedule draft.',
      );
      return;
    }
    if (draftCreation.current) draftCreation.current = null;
    setShowDiscard(false);
    if (blocker.state === 'blocked') blocker.proceed();
    else navigate('/schedules');
  };

  const saveDraftAndLeave = async () => {
    if (!state) return;
    setIsWorking(true);
    try {
      const saved =
        draftId === null
          ? await createDraft(state)
          : await window.segments.saveDraft(draftId, state);
      setDraftId(saved.id);
      setSegments((current) =>
        current.some((segment) => segment.id === saved.id)
          ? current.map((segment) =>
              segment.id === saved.id ? saved : segment,
            )
          : [saved, ...current],
      );
      setSavingError(null);
      setError(null);
      setShowDiscard(false);
      if (blocker.state === 'blocked') blocker.proceed();
      else navigate('/schedules');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to save schedule draft.',
      );
    } finally {
      setIsWorking(false);
    }
  };

  if (loadError) {
    return (
      <PageContent title="Create Schedule">
        <p role="alert">Unable to load schedule data: {loadError}</p>
      </PageContent>
    );
  }
  if (isLoading || !settings || !staff) {
    return (
      <PageContent title="Create Schedule">
        <p role="status">Loading schedule data…</p>
      </PageContent>
    );
  }

  const activeStep: SegmentStep =
    view === 'pto' || view === 'prn' ? view : 'review';
  const title =
    editScheduleId !== null
      ? 'Edit schedule'
      : view === 'review' || view === 'generating'
        ? 'Review & overrides'
        : 'Create Schedule';
  const displayedStart = state?.startDate;
  const displayedEnd = state?.endDate;

  return (
    <>
      <PageContent title={title}>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            {editScheduleId === null && (
              <div className="schedule-steps" aria-label="Schedule creation steps">
                {[
                  ['Input', 'bi-pencil'],
                  ['Generate', 'bi-arrow-repeat'],
                  ['Review', 'bi-eye'],
                  ['Confirm', 'bi-check-lg'],
                ].map(([label, icon], index) => {
                  const currentIndex =
                    activeStep === 'pto' || activeStep === 'prn'
                      ? 0
                      : view === 'generating'
                        ? 1
                        : 2;
                  const isCurrent = currentIndex === index;
                  const isComplete = currentIndex > index;
                  return (
                    <div className="schedule-step-wrap" key={label}>
                      {index > 0 && (
                        <span
                          className={`schedule-step-line ${isComplete || isCurrent ? 'complete' : ''}`}
                          aria-hidden="true"
                        />
                      )}
                      <div className={`schedule-step ${isCurrent ? 'current' : ''} ${isComplete ? 'complete' : ''}`}>
                        <span className="schedule-step-icon">
                          <i className={`bi ${icon}`} />
                        </span>
                        <span>{label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {displayedStart && displayedEnd && (
              <span className="schedule-period">
                Six-week schedule · {formatDateRange(displayedStart, displayedEnd)}
              </span>
            )}
          </div>

          {(view === 'pto' || view === 'prn') && state && (
            <>
              <InputGrid
                title={view === 'pto' ? 'PTO calendar' : 'PRN working days'}
                instructions={
                  view === 'pto'
                    ? 'click or drag cells to toggle'
                    : 'click or drag days to toggle'
                }
                staff={
                  view === 'pto'
                    ? people.filter((person) => person.employment !== Emp.PRN)
                    : prnStaff
                }
                dates={dates}
                startDate={state.startDate}
                selected={view === 'pto' ? ptoSet : prnSet}
                disabledKeys={view === 'prn' ? ptoSet : undefined}
                kind={view === 'pto' ? 'pto' : 'prn'}
                onToggle={(key, value) =>
                  updateMarkedDays(view === 'pto' ? 'ptoDates' : 'prnDates', key, value)
                }
              />
              {error && <p role="alert" className="text-sm! text-cherry-600">{error}</p>}
              {savingError && <p role="alert" className="text-sm! text-cherry-600">{savingError}</p>}
              <div className="flex flex-wrap justify-between gap-2">
                <Button
                  variant="outlined"
                  onClick={() => {
                    setError(null);
                    if (view === 'prn') {
                      setState((current) =>
                        current ? { ...current, step: 'pto' } : current,
                      );
                      setView('pto');
                    } else if (hasDraftProgress) {
                      setShowDiscard(true);
                    } else {
                      void discardDraft();
                    }
                  }}
                >
                  Back
                </Button>
                <Button onClick={() => (view === 'pto' ? nextFromPto() : runGeneration(state))}>
                  {view === 'pto' ? (prnStaff.length ? 'Next' : 'Generate') : 'Generate'}
                </Button>
              </div>
            </>
          )}

          {view === 'generating' && (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3" role="status">
              <span
                className="schedule-spinner animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              <h2>Building your schedule…</h2>
              <p className="text-sm!">Balancing coverage across six weeks.</p>
            </div>
          )}

          {view === 'review' && state && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {warnings.length > 0 && (
                    <span className="chip error">
                      {offTargetDays > 0
                        ? `${offTargetDays} ${offTargetDays === 1 ? 'day' : 'days'} off target`
                        : `${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`}
                    </span>
                  )}
                  {selectedWork && !onCallMode && (
                    <span className="text-sm">
                      Choose an off day in the same week to swap. Esc cancels.
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={onCallMode ? 'filled' : 'outlined'}
                    onClick={() => {
                      setOnCallMode((value) => !value);
                      setSelectedWork(null);
                    }}
                  >
                    <i className="bi bi-telephone mr-2" />
                    On-call
                  </Button>
                  <Button variant="outlined" disabled={undoStack.length === 0} onClick={undo}>
                    Undo
                  </Button>
                  <Button variant="outlined" disabled={redoStack.length === 0} onClick={redo}>
                    Redo
                  </Button>
                  {editScheduleId === null && <Button
                    variant="outlined"
                    onClick={() => {
                      if (state.hasManualEdits) setShowRegenerate(true);
                      else runGeneration(state);
                    }}
                  >
                    Regenerate
                  </Button>}
                </div>
              </div>

              <div
                className="schedule-grid-scroll review-grid-scroll"
                data-scrolled={reviewGridScrolled}
                onScroll={(event) =>
                  setReviewGridScrolled(event.currentTarget.scrollLeft > 0)
                }
              >
                <table className="schedule-grid review-grid">
                  <thead>
                    <tr>
                      <th className="schedule-name-cell" rowSpan={2} scope="col">
                        Staff
                      </th>
                      {weekGroups(dates, state.startDate).map((group) => (
                        <th key={group.week} colSpan={group.dates.length} scope="colgroup" className="schedule-week-cell">
                          Week {group.week + 1}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {dates.map((date) => (
                        <th className="schedule-day-cell" id={`day-${date}`} key={date} scope="col" title={formatDate(date)}>
                          {dayLabel(date).slice(0, 1)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((person, rowIndex) => (
                      <tr key={person.id}>
                        <th
                          className={`schedule-name-cell ${person.employment === Emp.PRN ? 'schedule-prn-row' : ''}`}
                          scope="row"
                        >
                          <span className="schedule-staff-label">
                            {person.lastName}, {person.firstName.slice(0, 1)}.
                          </span>
                          {person.employment === Emp.PRN && (
                            <span
                              className="schedule-prn-lock"
                              title="PRN"
                              aria-label="PRN"
                            >
                              <i className="bi bi-lock-fill" aria-hidden="true" />
                            </span>
                          )}
                        </th>
                        {dates.map((date, columnIndex) => {
                          const key = cellKey(person.id, date);
                          const isPto = ptoSet.has(key);
                          const shift = state.shifts.find(
                            (item) =>
                              item.staffId === person.id &&
                              item.date === date &&
                              item.kind === 'work',
                          );
                          const isOnCall = state.onCall.includes(key);
                          const isSelected =
                            selectedWork?.staffId === person.id &&
                            selectedWork.date === date;
                          const sameWeek =
                            selectedWork !== null &&
                            weekIndex(state.startDate, selectedWork.date) ===
                              weekIndex(state.startDate, date);
                          const isSwapTarget =
                            selectedWork?.staffId === person.id &&
                            sameWeek &&
                            !isPto &&
                            !shift &&
                            !isOnCall &&
                            !onCallMode;
                          const canSelect = shift !== undefined && !onCallMode;
                          const isPrn = person.employment === Emp.PRN;
                          const enabled = isPrn
                            ? false
                            : onCallMode
                            ? !person.inOrientation && !isPto && !shift
                            : selectedWork
                              ? isSwapTarget || canSelect
                              : canSelect;
                          const label = isPto
                            ? 'PTO'
                            : isOnCall
                              ? 'On-call'
                              : shift
                                ? shift.countsTowardTargets
                                  ? 'Working'
                                  : 'Working, does not count toward target'
                                : 'Off';
                          return (
                            <td key={date}>
                              <button
                                type="button"
                                aria-label={`${person.firstName} ${person.lastName}, ${formatDate(date)}: ${label}`}
                                aria-pressed={isSelected || isOnCall}
                                disabled={!enabled}
                                data-grid-row={rowIndex}
                                data-grid-column={columnIndex}
                                className={`schedule-cell ${isPto ? 'schedule-cell-pto' : ''} ${shift ? 'schedule-cell-work' : ''} ${isOnCall ? 'schedule-cell-oncall' : ''} ${isSelected ? 'schedule-cell-selected' : ''} ${isSwapTarget ? 'schedule-cell-target' : ''} ${isPrn ? 'schedule-cell-disabled' : ''}`}
                                onClick={() => {
                                  if (onCallMode && !isPto && !shift) {
                                    toggleOnCall(person.id, date);
                                  } else if (isSwapTarget && selectedWork) {
                                    makeSwap(selectedWork.staffId, selectedWork.date, date);
                                  } else if (shift) {
                                    setSelectedWork(
                                      isSelected
                                        ? null
                                        : { staffId: person.id, date },
                                    );
                                  }
                                }}
                                onKeyDown={(event) =>
                                  moveGridFocus(event, rowIndex, columnIndex)
                                }
                              >
                                {isPto ? 'P' : isOnCall ? 'OC' : shift ? 'W' : '–'}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {[
                      ['Nurses', Role.Nurse, state.settingsSnapshot.targetNurses],
                      ['Techs', Role.Tech, state.settingsSnapshot.targetTechs],
                    ].map(([label, role, target]) => (
                      <tr key={label}>
                        <th className="schedule-name-cell" scope="row">
                          {label} / {target}
                        </th>
                        {dates.map((date) => {
                          const counts = dailyCounts(date, state.staffSnapshot, state.shifts);
                          const count = role === Role.Nurse ? counts.nurses : counts.techs;
                          const isLow = count < Number(target);
                          return (
                            <td key={date}>
                              <span className={`schedule-total ${isLow ? 'schedule-total-low' : ''}`} aria-label={`${count} of ${target}`}>
                                {count}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tfoot>
                </table>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm!">
                  W work · – off · P PTO · OC on-call. Counts exclude orientation staff. Select a workday, then a highlighted off day to swap.
                </p>
                {warnings.length > 0 && (
                  <section className="schedule-warnings" aria-label="Schedule warnings">
                    <h2 className="text-base!">Warnings</h2>
                    <ul>
                      {warnings.map((warning, index) => (
                        <li key={`${warning.code}-${warning.date}-${warning.staffId}-${index}`}>
                          <button
                            type="button"
                            onClick={() => {
                              if (warning.date) {
                                document
                                  .getElementById(`day-${warning.date}`)
                                  ?.scrollIntoView({ block: 'nearest', inline: 'center' });
                              }
                            }}
                          >
                            {warningLabel(warning)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>

              {savingError && <p role="alert" className="text-sm! text-cherry-600">{savingError}</p>}
              <div className="flex flex-wrap justify-between gap-2">
                <Button
                  variant="outlined"
                  onClick={() => {
                    if (editScheduleId !== null) {
                      navigate(`/schedules/${editScheduleId}`);
                    } else if (state.hasManualEdits) setShowBackReview(true);
                    else returnToInputs();
                  }}
                >
                  Back
                </Button>
                <Button onClick={() => {
                  setAcknowledged(false);
                  setShowConfirm(true);
                }}>
                  Confirm
                </Button>
              </div>
            </>
          )}
        </div>
      </PageContent>

      <Dialog
        open={showConfirm}
        title={editScheduleId !== null ? 'Save schedule changes' : 'Confirm schedule'}
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => void confirmSchedule()}
        confirmLabel={
          isWorking
            ? 'Saving…'
            : editScheduleId !== null
              ? 'Save changes'
              : 'Confirm schedule'
        }
        confirmDisabled={isWorking || (warnings.length > 0 && !acknowledged)}
      >
        {state && (
          <div className="flex flex-col gap-4">
            <p>
              {editScheduleId !== null ? 'Save changes to' : 'Confirm'}{' '}
              {formatDateRange(state.startDate, state.endDate)} for{' '}
              {state.staffSnapshot.length} staff members.
            </p>
            <p>
              Nurses {countRange('nurses', 'min')}–{countRange('nurses', 'max')} /{' '}
              {state.settingsSnapshot.targetNurses} per day · Techs{' '}
              {countRange('techs', 'min')}–{countRange('techs', 'max')} /{' '}
              {state.settingsSnapshot.targetTechs} per day
            </p>
            <p>
              {warnings.length} {warnings.length === 1 ? 'warning remains' : 'warnings remain'}.
            </p>
            {warnings.length > 0 && (
              <div className="flex items-center gap-3">
                <label className="toggle">
                  <input
                    aria-label="Acknowledge warnings"
                    role="switch"
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) =>
                      setAcknowledged(event.currentTarget.checked)
                    }
                  />
                  <span className="toggle-track" aria-hidden="true" />
                </label>
                <span>I have reviewed and acknowledge the warnings.</span>
              </div>
            )}
            {savingError && <p role="alert" className="text-cherry-600">{savingError}</p>}
          </div>
        )}
      </Dialog>

      <Dialog
        open={showRegenerate}
        title="Discard manual edits?"
        onCancel={() => setShowRegenerate(false)}
        onConfirm={() => {
          setShowRegenerate(false);
          if (state) runGeneration(state);
        }}
        confirmLabel="Regenerate"
      >
        Regenerating will discard all manual swaps and on-call assignments.
      </Dialog>

      <Dialog
        open={
          editScheduleId === null &&
          (showDiscard || blocker.state === 'blocked')
        }
        title="Leave this schedule?"
        onCancel={() => {
          setShowDiscard(false);
          setError(null);
          if (blocker.state === 'blocked') blocker.reset();
        }}
        onSecondary={() => void saveDraftAndLeave()}
        onConfirm={() => void discardDraft()}
        cancelLabel="Cancel"
        secondaryLabel="Save draft"
        confirmLabel="Discard draft"
        confirmDisabled={isWorking}
        secondaryDisabled={isWorking}
        confirmVariant="danger"
      >
        <div className="flex flex-col gap-3">
          <p>
            Save this draft to continue it later, or discard it to remove it
            permanently. Cancel to stay here and keep editing.
          </p>
          {error && (
            <p role="alert" className="text-cherry-600">
              {error}
            </p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={showBackReview}
        title="Discard review edits?"
        onCancel={() => setShowBackReview(false)}
        onConfirm={returnToInputs}
        confirmLabel="Back to inputs"
      >
        Returning to the input step will discard swaps and on-call assignments.
      </Dialog>
    </>
  );
};

export default GeneratorPage;
