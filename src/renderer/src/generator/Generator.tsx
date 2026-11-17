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
  Dept,
  Emp,
  Role,
  type FmlaEntry,
  type ScheduleSegment,
  type SegmentState,
  type SegmentStep,
  type Settings,
  type Staff,
} from '../../../types';
import { Button } from '../inputs/Button';
import { DatePicker } from '../inputs/DatePicker';
import { IconButton } from '../inputs/IconButton';
import { Dialog } from '../layout/Dialog';
import { PageContent } from '../layout/PageContent';
import { useToast } from '../layout/Toast';
import { TeamWelcome } from '../dashboard/TeamWelcome';
import {
  cellKey,
  dailyCounts,
  dayLabel,
  generateSegmentShifts,
  getFmlaCellKeys,
  getRolledOverFmlaEntries,
  isValidFmlaRange,
  getSegmentDates,
  nextWorkingStart,
  ptoChangeCount,
  segmentEndDate,
  weekIndex,
} from './engine';
import {
  getWeekendOnCallEligibleStaff,
  getAutoOnCallSchedule,
  hasWeekendBoundaryLeave,
  isOnCallEligible,
  isWeekendOnCallEligible,
  onCallTarget,
} from './onCall';

const palmIcon = new URL('../assets/palm-icon.svg', import.meta.url).href;
const palmTree = new URL('../assets/palm-tree.svg', import.meta.url).href;

type View = 'fmla' | 'pto' | 'prn' | 'generating' | 'review';
type ReviewEdit = Pick<
  SegmentState,
  | 'shifts'
  | 'onCall'
  | 'onCallDepartments'
  | 'weekendOnCall'
  | 'onCallManuallyEdited'
  | 'onCallAutoApplied'
>;

const reviewEdit = (state: SegmentState): ReviewEdit => ({
  shifts: state.shifts,
  onCall: state.onCall,
  onCallDepartments: state.onCallDepartments ?? {},
  weekendOnCall: state.weekendOnCall ?? [],
  onCallManuallyEdited: state.onCallManuallyEdited ?? false,
  onCallAutoApplied: state.onCallAutoApplied ?? false,
});

const formatDate = (date: string): string =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));

const formatDateRange = (startDate: string, endDate: string): string =>
  `${formatDate(startDate)} – ${formatDate(endDate)}, ${endDate.slice(0, 4)}`;

const fmlaAppliesTo = (
  entry: FmlaEntry,
  segmentStart: string,
  segmentEnd: string,
): string => {
  const start =
    entry.startDate && entry.startDate > segmentStart
      ? entry.startDate
      : segmentStart;
  const end =
    entry.endDate && entry.endDate < segmentEnd ? entry.endDate : segmentEnd;
  if (start > end) return 'Outside schedule';
  if (start === segmentStart && end === segmentEnd) return 'Whole schedule';
  const weeks = Math.ceil(
    (Date.parse(`${end}T00:00:00.000Z`) -
      Date.parse(`${start}T00:00:00.000Z`) +
      24 * 60 * 60 * 1000) /
      (7 * 24 * 60 * 60 * 1000),
  );
  return `${formatDate(start)} – ${formatDate(end)} · ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
};

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
    return (
      a.lastName.localeCompare(b.lastName) ||
      a.firstName.localeCompare(b.firstName)
    );
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
    <section className='flex min-w-0 flex-col gap-3'>
      <h2 className='text-sm! sm:text-base!'>
        {title} <span className='font-normal'>({instructions})</span>
      </h2>
      {people.length === 0 ? (
        <p className='text-sm!'>No staff members in this group.</p>
      ) : (
        <div
          className='schedule-grid-scroll'
          data-scrolled={isScrolled}
          onScroll={(event) =>
            setIsScrolled(event.currentTarget.scrollLeft > 0)
          }
          onPointerUp={() => setPaintValue(null)}
          onPointerLeave={() => setPaintValue(null)}
        >
          <table className='schedule-grid input-grid'>
            <thead>
              <tr>
                <th className='schedule-name-cell' rowSpan={2} scope='col'>
                  Staff
                </th>
                {groups.map((group) => (
                  <th
                    key={group.week}
                    className='schedule-week-cell'
                    colSpan={group.dates.length}
                    scope='colgroup'
                  >
                    Week {group.week + 1}
                  </th>
                ))}
              </tr>
              <tr>
                {dates.map((date) => (
                  <th
                    className='schedule-day-cell'
                    key={date}
                    id={`day-${date}`}
                    scope='col'
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
                  <th className='schedule-name-cell' scope='row'>
                    <span className='schedule-staff-label'>
                      {person.firstName} {person.lastName.slice(0, 1)}.
                    </span>
                    {person.role === Role.ChargeNurse && (
                      <span className='schedule-role-label'>CSL</span>
                    )}
                  </th>
                  {dates.map((date, columnIndex) => {
                    const key = cellKey(person.id, date);
                    const isSelected = selected.has(key);
                    const isDisabled = disabledKeys?.has(key) ?? false;
                    return (
                      <td key={date}>
                        <button
                          type='button'
                          aria-label={`${person.firstName} ${person.lastName}, ${formatDate(date)}: ${isDisabled ? 'unavailable due to leave' : isSelected ? 'selected' : 'not selected'}`}
                          aria-pressed={isSelected}
                          disabled={isDisabled}
                          data-grid-row={rowIndex}
                          data-grid-column={columnIndex}
                          className={`schedule-cell ${isSelected ? (kind === 'pto' ? 'schedule-cell-pto' : 'schedule-cell-prn') : ''}`}
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
                  <th className='schedule-name-cell' scope='row'>
                    PTO
                  </th>
                  {dates.map((date) => (
                    <td key={date}>
                      <span className='schedule-total'>
                        {
                          people.filter((person) =>
                            selected.has(cellKey(person.id, date)),
                          ).length
                        }
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

const GeneratorPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
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
  const [view, setView] = useState<View>('fmla');
  const [fmlaSearch, setFmlaSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingError, setSavingError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [onCallMode, setOnCallMode] = useState(false);
  const [ptoMode, setPtoMode] = useState(false);
  const [ptoModeInitialDates, setPtoModeInitialDates] = useState<string[] | null>(
    null,
  );
  const [ptoModeInitialManualEdits, setPtoModeInitialManualEdits] =
    useState(false);
  const [showPtoRecalculate, setShowPtoRecalculate] = useState(false);
  const [isRecalculatingPto, setIsRecalculatingPto] = useState(false);
  const [paintPtoValue, setPaintPtoValue] = useState<boolean | null>(null);
  const [onCallPopupKey, setOnCallPopupKey] = useState<string | null>(null);
  const [weekendPopupWeek, setWeekendPopupWeek] = useState<string | null>(null);
  const [pendingOnCallWarning, setPendingOnCallWarning] = useState<{
    staffId: number;
    date: string;
  } | null>(null);
  const [selectedWork, setSelectedWork] = useState<{
    staffId: number;
    date: string;
  } | null>(null);
  const [undoStack, setUndoStack] = useState<ReviewEdit[]>([]);
  const [redoStack, setRedoStack] = useState<ReviewEdit[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [showBackReview, setShowBackReview] = useState(false);
  const [reviewGridScrolled, setReviewGridScrolled] = useState(false);
  const hasDraftProgress =
    state !== null &&
    (view === 'review' ||
      view === 'generating' ||
      state.fmlaEntries.some((entry) => entry.onFmla || entry.rolledOver) ||
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
    Promise.all([
      window.staff.list(),
      window.settings.get(),
      window.segments.list(),
    ])
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
          setDraftId(null);
          setEditScheduleId(null);
          setView('fmla');
          const previousSegment = savedSegments
            .filter((segment) => segment.status === 'confirmed')
            .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
          const startDate = nextWorkingStart(
            savedSettings.workingDays,
            savedSegments
              .filter((segment) => segment.status === 'confirmed')
              .map((segment) => segment.endDate),
          );
          if (!startDate) {
            setLoadError(
              'Choose at least one working day in Settings before creating a schedule.',
            );
            return;
          }

          const initial: SegmentState = {
            step: 'fmla',
            startDate,
            endDate: segmentEndDate(startDate, savedSettings.workingDays),
            fmlaEntries: previousSegment
              ? getRolledOverFmlaEntries(previousSegment, startDate)
              : [],
            ptoDates: [],
            prnDates: [],
            shifts: [],
            onCall: [],
            onCallDepartments: {},
            weekendOnCall: [],
            onCallManuallyEdited: false,
            onCallAutoApplied: false,
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
            reason instanceof Error
              ? reason.message
              : 'Unable to load schedule data.',
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
  const weekendOnCallStaff = useMemo(
    () => people.filter(isWeekendOnCallEligible),
    [people],
  );
  const reviewCounts = state
    ? dates.map((date) => dailyCounts(date, state.staffSnapshot, state.shifts))
    : [];
  const countRange = (key: 'nurses' | 'techs', edge: 'min' | 'max') => {
    const counts = reviewCounts.map((count) => count[key]);
    if (counts.length === 0) return 0;
    return edge === 'min' ? Math.min(...counts) : Math.max(...counts);
  };
  const ptoSet = useMemo(
    () => new Set(state?.ptoDates ?? []),
    [state?.ptoDates],
  );
  const ptoChanges =
    state && ptoModeInitialDates
      ? ptoChangeCount(ptoModeInitialDates, state.ptoDates)
      : 0;
  const prnSet = useMemo(
    () => new Set(state?.prnDates ?? []),
    [state?.prnDates],
  );
  const fmlaSet = useMemo(
    () => new Set(getFmlaCellKeys(state?.fmlaEntries ?? [], dates)),
    [dates, state?.fmlaEntries],
  );
  const visibleFmlaStaff = useMemo(() => {
    const search = fmlaSearch.trim().toLocaleLowerCase();
    return people.filter((person) =>
      `${person.firstName} ${person.lastName}`
        .toLocaleLowerCase()
        .includes(search),
    );
  }, [fmlaSearch, people]);
  const fmlaCount =
    state?.fmlaEntries.filter((entry) => entry.onFmla).length ?? 0;
  const rolledOverCount =
    state?.fmlaEntries.filter((entry) => entry.rolledOver && entry.onFmla)
      .length ?? 0;
  const hasInvalidFmlaRange = state
    ? state.fmlaEntries.some(
        (entry) =>
          entry.onFmla &&
          !isValidFmlaRange(entry, state.startDate, state.endDate),
      )
    : false;

  const updateMarkedDays = (
    field: 'ptoDates' | 'prnDates',
    key: string,
    value: boolean,
  ) => {
    setState((current) => {
      if (!current) return current;
      const values = new Set(current[field]);
      if (value) values.add(key);
      else values.delete(key);
      return { ...current, [field]: [...values] };
    });
  };

  const setFmlaEnabled = (person: Staff, onFmla: boolean) => {
    if (!state) return;
    const existing = state.fmlaEntries.find(
      (entry) => entry.staffId === person.id,
    );
    if (!onFmla && existing?.rolledOver) {
      toast.success(
        `${person.firstName} ${person.lastName} removed from FMLA`,
        "They'll be scheduled as usual.",
        {
          label: 'Undo',
          onClick: () =>
            setState((current) =>
              current
                ? {
                    ...current,
                    fmlaEntries: current.fmlaEntries.map((entry) =>
                      entry.staffId === person.id
                        ? { ...entry, onFmla: true }
                        : entry,
                    ),
                  }
                : current,
            ),
        },
      );
    }
    setState({
      ...state,
      fmlaEntries: onFmla
        ? existing
          ? state.fmlaEntries.map((entry) =>
              entry.staffId === person.id ? { ...entry, onFmla: true } : entry,
            )
          : [
              ...state.fmlaEntries,
              {
                staffId: person.id,
                onFmla: true,
                startDate: null,
                endDate: null,
                rolledOver: false,
              },
            ]
        : state.fmlaEntries
            .map((entry) =>
              entry.staffId === person.id ? { ...entry, onFmla: false } : entry,
            )
            .filter((entry) => entry.onFmla || entry.rolledOver),
    });
  };

  const updateFmlaDate = (
    staffId: number,
    field: 'startDate' | 'endDate',
    value: string,
  ) => {
    setState((current) => {
      if (!current) return current;
      return {
        ...current,
        fmlaEntries: current.fmlaEntries.map((entry) =>
          entry.staffId === staffId
            ? { ...entry, [field]: value || null }
            : entry,
        ),
      };
    });
  };

  const runGeneration = useCallback((source: SegmentState) => {
    setView('generating');
    setSelectedWork(null);
    window.setTimeout(() => {
      const generated: SegmentState = {
        ...source,
        step: 'review',
        shifts: generateSegmentShifts(
          source.staffSnapshot,
          getSegmentDates(
            source.startDate,
            source.settingsSnapshot.workingDays,
          ),
          source.ptoDates,
          source.prnDates,
          source.startDate,
          source.seed,
          source.fmlaEntries,
          source.settingsSnapshot.procRooms,
        ),
        onCall: [],
        onCallDepartments: {},
        weekendOnCall: [],
        onCallManuallyEdited: false,
        onCallAutoApplied: false,
        hasManualEdits: false,
      };
      setState(generated);
      setUndoStack([]);
      setRedoStack([]);
      setOnCallPopupKey(null);
      setView('review');
    }, 120);
  }, []);

  const nextFromFmla = () => {
    if (!state || hasInvalidFmlaRange) return;
    const nextState: SegmentState = { ...state, step: 'pto' };
    setState(nextState);
    setView('pto');
  };

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
    setUndoStack((history) => [...history, reviewEdit(state)]);
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

  const updateOnCall = (
    onCall: string[],
    onCallDepartments: Record<string, Dept>,
    weekendOnCall: NonNullable<SegmentState['weekendOnCall']>,
    onCallManuallyEdited: boolean,
    onCallAutoApplied = false,
  ) => {
    if (!state) return;
    setUndoStack((history) => [...history, reviewEdit(state)]);
    setRedoStack([]);
    setState({
      ...state,
      onCall,
      onCallDepartments,
      weekendOnCall,
      onCallManuallyEdited,
      onCallAutoApplied,
      hasManualEdits: true,
    });
  };

  const startPtoMode = () => {
    if (!state) return;
    setPtoModeInitialDates([...state.ptoDates]);
    setPtoModeInitialManualEdits(state.hasManualEdits);
    setPtoMode(true);
    setOnCallMode(false);
    setSelectedWork(null);
    setOnCallPopupKey(null);
    setWeekendPopupWeek(null);
  };

  const requestPtoRecalculation = () => {
    setPtoMode(false);
    setSelectedWork(null);
    if (ptoChanges === 0) {
      setPtoModeInitialDates(null);
      setShowPtoRecalculate(false);
      return;
    }
    setShowPtoRecalculate(true);
  };

  const setReviewPto = (key: string, value: boolean) => {
    setState((current) => {
      if (!current) return current;
      const ptoDates = new Set(current.ptoDates);
      if (value) ptoDates.add(key);
      else ptoDates.delete(key);
      const weekendOnCall = (current.weekendOnCall ?? []).map((assignment) =>
        assignment.staffId !== null &&
        hasWeekendBoundaryLeave(
          assignment.staffId,
          assignment.weekStart,
          current.shifts,
          [...ptoDates],
          current.fmlaEntries,
        )
          ? { ...assignment, staffId: null }
          : assignment,
      );
      return {
        ...current,
        ptoDates: [...ptoDates],
        weekendOnCall,
        hasManualEdits: true,
      };
    });
  };

  const keepEditingPto = () => {
    setShowPtoRecalculate(false);
    setPtoMode(true);
  };

  const discardPtoChanges = () => {
    if (state && ptoModeInitialDates) {
      setState({
        ...state,
        ptoDates: ptoModeInitialDates,
        hasManualEdits: ptoModeInitialManualEdits,
      });
    }
    setPtoModeInitialDates(null);
    setPtoMode(false);
    setShowPtoRecalculate(false);
  };

  const recalculateAroundPto = () => {
    if (!state) return;
    const changedDates = ptoModeInitialDates
      ? ptoChangeCount(ptoModeInitialDates, state.ptoDates)
      : 0;
    setShowPtoRecalculate(false);
    setPtoMode(false);
    setSelectedWork(null);
    setIsWorking(true);
    setIsRecalculatingPto(true);
    setView('generating');
    window.setTimeout(() => {
      try {
        const recalculated: SegmentState = {
          ...state,
          step: 'review',
          shifts: generateSegmentShifts(
            state.staffSnapshot,
            getSegmentDates(state.startDate, state.settingsSnapshot.workingDays),
            state.ptoDates,
            state.prnDates,
            state.startDate,
            state.seed,
            state.fmlaEntries,
            state.settingsSnapshot.procRooms,
          ),
          onCall: [],
          onCallDepartments: {},
          weekendOnCall: [],
          onCallManuallyEdited: false,
          onCallAutoApplied: false,
          hasManualEdits: false,
        };
        setState(recalculated);
        setUndoStack([]);
        setRedoStack([]);
        setOnCallPopupKey(null);
        setWeekendPopupWeek(null);
        setPtoModeInitialDates(null);
        setView('review');
        toast.success(
          'Schedule recalculated',
          `${changedDates} PTO ${changedDates === 1 ? 'change' : 'changes'} applied.`,
        );
      } catch (reason) {
        const message =
          reason instanceof Error
            ? reason.message
            : 'Unable to recalculate the schedule.';
        setSavingError(message);
        setView('review');
        toast.failure("Couldn't recalculate schedule", message);
      } finally {
        setIsWorking(false);
        setIsRecalculatingPto(false);
      }
    }, 350);
  };

  const setOnCallAssignment = (
    staffId: number,
    date: string,
    department: Dept | null,
  ) => {
    if (!state) return;
    const key = cellKey(staffId, date);
    const onCall = new Set(state.onCall);
    const onCallDepartments = { ...(state.onCallDepartments ?? {}) };
    if (department === null) {
      onCall.delete(key);
      delete onCallDepartments[key];
    } else {
      onCall.add(key);
      onCallDepartments[key] = department;
    }
    updateOnCall(
      [...onCall],
      onCallDepartments,
      state.weekendOnCall ?? [],
      true,
    );
    setOnCallPopupKey(null);
  };

  const autoApplyOnCall = () => {
    if (!state) return;
    const assignments = getAutoOnCallSchedule(
      state.staffSnapshot,
      dates,
      state.shifts,
      state.startDate,
      state.ptoDates,
      state.fmlaEntries,
    );
    const fmlaShiftDates = state.shifts
      .filter((shift) => shift.kind === 'fmla')
      .map((shift) => ({ staffId: shift.staffId, date: shift.date }));
    const fmlaStaffIds = new Set([
      ...state.fmlaEntries
        .filter((entry) => entry.onFmla)
        .map((entry) => entry.staffId),
      ...fmlaShiftDates.map((shift) => shift.staffId),
    ]);
    const assignedFmlaStaffIds = assignments.weekendOnCall
      .filter(
        (assignment) =>
          assignment.staffId !== null && fmlaStaffIds.has(assignment.staffId),
      )
      .map((assignment) => assignment.staffId);

    console.info('[on-call] Auto-apply generation', {
      startDate: state.startDate,
      endDate: state.endDate,
      activeFmlaEntries: state.fmlaEntries.filter((entry) => entry.onFmla),
      fmlaShiftDates,
      fmlaStaff: state.staffSnapshot
        .filter((person) => fmlaStaffIds.has(person.id))
        .map((person) => ({
          staffId: person.id,
          name: `${person.firstName} ${person.lastName}`,
          rolledOver: state.fmlaEntries.some(
            (entry) =>
              entry.staffId === person.id &&
              entry.onFmla &&
              entry.rolledOver,
          ),
        })),
      generatedWeekdayOnCall: assignments.onCall,
      generatedWeekendOnCall: assignments.weekendOnCall,
      generatedWeekendAssignmentsToFmlaStaff: assignedFmlaStaffIds,
    });
    if (assignedFmlaStaffIds.length > 0) {
      console.warn(
        '[on-call] Auto-apply assigned weekend OC to active FMLA staff.',
        assignedFmlaStaffIds,
      );
    }

    updateOnCall(
      assignments.onCall,
      assignments.onCallDepartments,
      assignments.weekendOnCall,
      false,
      true,
    );
    setOnCallPopupKey(null);
    setWeekendPopupWeek(null);
  };

  const beginOnCallAssignment = (person: Staff, date: string) => {
    if (!state) return;
    const key = cellKey(person.id, date);
    const isOnCall = state.onCall.includes(key);
    const hasPacu = person.departments.includes(Dept.PACU);
    const hasProc = person.departments.includes(Dept.PROC);
    const needsDepartmentChoice =
      person.role === Role.ChargeNurse || hasPacu === hasProc;
    if (isOnCall) {
      if (needsDepartmentChoice) setOnCallPopupKey(key);
      else setOnCallAssignment(person.id, date, null);
      return;
    }

    if (person.inOrientation) {
      setPendingOnCallWarning({ staffId: person.id, date });
      return;
    }
    if (person.role === Role.ChargeNurse) {
      setOnCallPopupKey(key);
      return;
    }
    if (!hasPacu && !hasProc) {
      setPendingOnCallWarning({ staffId: person.id, date });
      return;
    }
    if (needsDepartmentChoice) {
      setOnCallPopupKey(key);
      return;
    }
    setOnCallAssignment(person.id, date, hasPacu ? Dept.PACU : Dept.PROC);
  };

  const confirmUnconventionalOnCall = () => {
    if (!state || !pendingOnCallWarning) return;
    const { staffId, date } = pendingOnCallWarning;
    const person = state.staffSnapshot.find((member) => member.id === staffId);
    setPendingOnCallWarning(null);
    if (!person) return;
    const hasPacu = person.departments.includes(Dept.PACU);
    const hasProc = person.departments.includes(Dept.PROC);
    if (person.role === Role.ChargeNurse || hasPacu === hasProc) {
      setOnCallPopupKey(cellKey(staffId, date));
    } else {
      setOnCallAssignment(staffId, date, hasPacu ? Dept.PACU : Dept.PROC);
    }
  };

  const updateWeekendOnCall = (weekStart: string, value: string) => {
    if (!state) return;
    const staffId = value === '' ? null : Number(value);
    const weekendOnCall = (state.weekendOnCall ?? []).filter(
      (entry) => entry.weekStart !== weekStart,
    );
    weekendOnCall.push({ weekStart, staffId });
    updateOnCall(
      state.onCall,
      state.onCallDepartments ?? {},
      weekendOnCall,
      true,
    );
  };

  const returnToInputs = () => {
    if (!state) return;
    const previousStep = prnStaff.length > 0 ? 'prn' : 'pto';
    const nextState: SegmentState = {
      ...state,
      step: previousStep,
      shifts: [],
      onCall: [],
      onCallDepartments: {},
      weekendOnCall: [],
      onCallManuallyEdited: false,
      onCallAutoApplied: false,
      hasManualEdits: false,
    };
    setState(nextState);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedWork(null);
    setOnCallPopupKey(null);
    setShowBackReview(false);
    setView(previousStep);
  };

  const undo = useCallback(() => {
    if (!state || undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((stack) => [...stack, reviewEdit(state)]);
    setUndoStack((stack) => stack.slice(0, -1));
    setState({
      ...state,
      shifts: previous.shifts,
      onCall: previous.onCall,
      onCallDepartments: previous.onCallDepartments ?? {},
      weekendOnCall: previous.weekendOnCall ?? [],
      onCallManuallyEdited: previous.onCallManuallyEdited ?? false,
      onCallAutoApplied: previous.onCallAutoApplied ?? false,
      hasManualEdits: true,
    });
  }, [state, undoStack]);

  const redo = useCallback(() => {
    if (!state || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((stack) => [...stack, reviewEdit(state)]);
    setRedoStack((stack) => stack.slice(0, -1));
    setState({
      ...state,
      shifts: next.shifts,
      onCall: next.onCall,
      onCallDepartments: next.onCallDepartments ?? {},
      weekendOnCall: next.weekendOnCall ?? [],
      onCallManuallyEdited: next.onCallManuallyEdited ?? false,
      onCallAutoApplied: next.onCallAutoApplied ?? false,
      hasManualEdits: true,
    });
  }, [redoStack, state]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (view !== 'review') return;
      if (event.key === 'Escape') {
        setSelectedWork(null);
        setOnCallPopupKey(null);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        if (
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          (event.target instanceof HTMLElement &&
            event.target.isContentEditable)
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
    if (!state) return;
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
      toast.success(
        editScheduleId !== null ? 'Schedule saved' : 'Schedule confirmed',
        editScheduleId !== null
          ? 'Your schedule changes are saved.'
          : 'Saved to History. Smooth sailing.',
      );
      navigate(`/schedules/${confirmed.id}`);
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : 'Unable to confirm this schedule.';
      setSavingError(message);
      toast.failure(
        editScheduleId !== null
          ? "Couldn't save schedule"
          : "Couldn't confirm schedule",
        message,
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
      const message =
        reason instanceof Error
          ? reason.message
          : 'Unable to delete schedule draft.';
      setError(message);
      toast.failure("Couldn't delete schedule draft", message);
      return;
    }
    toast.success('Draft discarded', 'The schedule draft was removed.');
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
      toast.success(
        'Schedule saved',
        'Draft saved. You can pick up where you left off.',
      );
      if (blocker.state === 'blocked') blocker.proceed();
      else navigate('/schedules');
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : 'Unable to save schedule draft.';
      setError(message);
      toast.failure("Couldn't save schedule", message);
    } finally {
      setIsWorking(false);
    }
  };

  if (loadError) {
    return (
      <PageContent title='Create Schedule'>
        <p role='alert'>Unable to load schedule data: {loadError}</p>
      </PageContent>
    );
  }
  if (isLoading || !settings || !staff) {
    return (
      <PageContent title='Create Schedule'>
        <p role='status'>Loading schedule data…</p>
      </PageContent>
    );
  }
  if (staff.length === 0) {
    return (
      <PageContent title='Create Schedule'>
        <TeamWelcome onAddStaff={() => navigate('/staff/new')} />
      </PageContent>
    );
  }

  const activeStep: SegmentStep =
    view === 'fmla' || view === 'pto' || view === 'prn' ? view : 'review';
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
        <div className='flex min-w-0 flex-col gap-4'>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            {editScheduleId === null && (
              <div
                className='schedule-steps'
                aria-label='Schedule creation steps'
              >
                {[
                  ['FMLA', 'bi-heart'],
                  ['PTO', 'bi-pencil'],
                  ['Generate', 'bi-arrow-repeat'],
                  ['Review', 'bi-eye'],
                  ['Confirm', 'bi-check-lg'],
                ].map(([label, icon], index) => {
                  const currentIndex =
                    activeStep === 'fmla'
                      ? 0
                      : activeStep === 'pto' || activeStep === 'prn'
                        ? 1
                        : view === 'generating'
                          ? 2
                          : 3;
                  const isCurrent = currentIndex === index;
                  const isComplete = currentIndex > index;
                  return (
                    <div className='schedule-step-wrap' key={label}>
                      {index > 0 && (
                        <span
                          className={`schedule-step-line ${isComplete || isCurrent ? 'complete' : ''}`}
                          aria-hidden='true'
                        />
                      )}
                      <div
                        className={`schedule-step ${isCurrent ? 'current' : ''} ${isComplete ? 'complete' : ''}`}
                      >
                        <span className='schedule-step-icon'>
                          {label === 'PTO' ? (
                            <img src={palmIcon} alt='' aria-hidden='true' />
                          ) : (
                            <i className={`bi ${icon}`} />
                          )}
                        </span>
                        <span>{label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {displayedStart && displayedEnd && (
              <span className='schedule-period'>
                Six-week schedule ·{' '}
                {formatDateRange(displayedStart, displayedEnd)}
              </span>
            )}
          </div>

          {view === 'fmla' && state && (
            <section className='fmla-step flex min-w-0 flex-col gap-3'>
              <h2 className='text-sm! sm:text-base!'>FMLA</h2>
              <div className='fmla-rollover-banner' role='status'>
                <span className='fmla-heart' aria-hidden='true'>
                  <i className='bi bi-heart-fill' />
                </span>
                <span>
                  {rolledOverCount === 0
                    ? 'No staff members rolled over from the last schedule'
                    : `${rolledOverCount} staff ${rolledOverCount === 1 ? 'member' : 'members'} rolled over from the last schedule`}
                </span>
              </div>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <input
                  type='search'
                  aria-label='Search staff'
                  placeholder='Search staff'
                  value={fmlaSearch}
                  onChange={(event) => setFmlaSearch(event.currentTarget.value)}
                  className='fmla-search'
                />
                <span className='fmla-count'>{fmlaCount} on FMLA</span>
              </div>
              <div className='fmla-table-scroll'>
                <table className='fmla-table'>
                  <colgroup>
                    <col className='fmla-staff-column' />
                    <col className='fmla-toggle-column' />
                    <col className='fmla-date-column' />
                    <col className='fmla-date-column' />
                    <col className='fmla-applies-column' />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope='col'>Staff</th>
                      <th scope='col'>On FMLA</th>
                      <th scope='col'>Start date (optional)</th>
                      <th scope='col'>End date (optional)</th>
                      <th scope='col'>Applies to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleFmlaStaff.map((person) => {
                      const entry = state.fmlaEntries.find(
                        (item) => item.staffId === person.id,
                      );
                      const isOnFmla = entry?.onFmla ?? false;
                      const invalidRange =
                        isOnFmla &&
                        entry !== undefined &&
                        !isValidFmlaRange(
                          entry,
                          state.startDate,
                          state.endDate,
                        );
                      const appliesTo =
                        entry && isOnFmla
                          ? fmlaAppliesTo(entry, state.startDate, state.endDate)
                          : '';
                      return (
                        <tr
                          key={person.id}
                          className={
                            entry?.rolledOver && isOnFmla
                              ? 'fmla-row-rolled'
                              : ''
                          }
                        >
                          <th scope='row'>
                            <span>
                              {person.firstName} {person.lastName.slice(0, 1)}.
                            </span>
                            {entry?.rolledOver && (
                              <span
                                className={`fmla-rollover-chip ${isOnFmla ? '' : 'was-rolled-over'}`}
                              >
                                {isOnFmla ? 'Rolled over' : 'Was rolled over'}
                              </span>
                            )}
                          </th>
                          <td>
                            <label className='toggle'>
                              <input
                                type='checkbox'
                                role='switch'
                                aria-label={`On FMLA for ${person.firstName} ${person.lastName}`}
                                checked={isOnFmla}
                                onChange={(event) =>
                                  setFmlaEnabled(
                                    person,
                                    event.currentTarget.checked,
                                  )
                                }
                              />
                              <span
                                className='toggle-track'
                                aria-hidden='true'
                              />
                            </label>
                          </td>
                          <td>
                            <div
                              className={`fmla-date-slot ${isOnFmla ? '' : 'is-hidden'}`}
                              aria-hidden={!isOnFmla}
                            >
                              {entry?.rolledOver && isOnFmla ? (
                                <span className='fmla-locked-date'>
                                  <input
                                    type='text'
                                    value={`Since ${formatDate(entry.startDate ?? state.startDate)}`}
                                    aria-label={`Start date for ${person.firstName} ${person.lastName}`}
                                    disabled
                                  />
                                  <i
                                    className='bi bi-lock-fill'
                                    aria-hidden='true'
                                  />
                                </span>
                              ) : (
                                <DatePicker
                                  label={`Start date for ${person.firstName} ${person.lastName}`}
                                  value={entry?.startDate ?? null}
                                  scheduleStart={state.startDate}
                                  scheduleEnd={state.endDate}
                                  minDate={state.startDate}
                                  maxDate={state.endDate}
                                  rangeStart={entry?.startDate ?? state.startDate}
                                  rangeEnd={entry?.endDate ?? null}
                                  onChange={(value) =>
                                    updateFmlaDate(
                                      person.id,
                                      'startDate',
                                      value ?? '',
                                    )
                                  }
                                />
                              )}
                            </div>
                          </td>
                          <td>
                            <div
                              className={`fmla-date-slot ${isOnFmla ? '' : 'is-hidden'}`}
                              aria-hidden={!isOnFmla}
                            >
                              <DatePicker
                                label={`End date for ${person.firstName} ${person.lastName}`}
                                value={entry?.endDate ?? null}
                                scheduleStart={state.startDate}
                                scheduleEnd={state.endDate}
                                minDate={state.startDate}
                                maxDate={state.endDate}
                                rangeStart={
                                  entry?.startDate ?? state.startDate
                                }
                                rangeEnd={entry?.endDate ?? null}
                                invalid={invalidRange}
                                describedBy={
                                  invalidRange
                                    ? `fmla-error-${person.id}`
                                    : undefined
                                }
                                onChange={(value) =>
                                  updateFmlaDate(
                                    person.id,
                                    'endDate',
                                    value ?? '',
                                  )
                                }
                              />
                              <span
                                id={`fmla-error-${person.id}`}
                                className='fmla-date-error'
                                role={invalidRange ? 'alert' : undefined}
                              >
                                {invalidRange
                                  ? 'End date must be after start date'
                                  : ' '}
                              </span>
                            </div>
                          </td>
                          <td className='fmla-applies'>{appliesTo}</td>
                        </tr>
                      );
                    })}
                    {visibleFmlaStaff.length === 0 && (
                      <tr>
                        <td colSpan={5} className='fmla-empty'>
                          No staff members found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {savingError && (
                <p role='alert' className='text-sm! text-cherry-600'>
                  {savingError}
                </p>
              )}
              <div className='flex flex-wrap justify-between gap-2'>
                <IconButton
                  ariaLabel='Back'
                  icon='bi-chevron-left'
                  variant='outlined'
                  onClick={() => {
                    if (hasDraftProgress) setShowDiscard(true);
                    else void discardDraft();
                  }}
                />
                <Button disabled={hasInvalidFmlaRange} onClick={nextFromFmla}>
                  Continue
                </Button>
              </div>
            </section>
          )}

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
                disabledKeys={
                  view === 'prn' ? new Set([...ptoSet, ...fmlaSet]) : fmlaSet
                }
                kind={view === 'pto' ? 'pto' : 'prn'}
                onToggle={(key, value) =>
                  updateMarkedDays(
                    view === 'pto' ? 'ptoDates' : 'prnDates',
                    key,
                    value,
                  )
                }
              />
              {error && (
                <p role='alert' className='text-sm! text-cherry-600'>
                  {error}
                </p>
              )}
              {savingError && (
                <p role='alert' className='text-sm! text-cherry-600'>
                  {savingError}
                </p>
              )}
              <div className='flex flex-wrap justify-between gap-2'>
                <IconButton
                  ariaLabel='Back'
                  icon='bi-chevron-left'
                  variant='outlined'
                  onClick={(event) => {
                    setError(null);
                    if (view === 'prn') {
                      setState((current) =>
                        current ? { ...current, step: 'pto' } : current,
                      );
                      setView('pto');
                    } else if (view === 'pto') {
                      setState((current) =>
                        current ? { ...current, step: 'fmla' } : current,
                      );
                      setView('fmla');
                    } else if (hasDraftProgress) {
                      setShowDiscard(true);
                    } else {
                      void discardDraft();
                    }
                  }}
                />
                {view === 'pto' && prnStaff.length > 0 ? (
                  <Button onClick={nextFromPto}>Next</Button>
                ) : (
                  <IconButton
                    ariaLabel='Generate'
                    title='Generate schedule'
                    icon='bi-arrow-repeat'
                    variant='filled'
                    onClick={() =>
                      view === 'pto' ? nextFromPto() : runGeneration(state)
                    }
                  />
                )}
              </div>
            </>
          )}

          {view === 'generating' && (
            <div
              className='flex min-h-56 flex-col items-center justify-center gap-3'
              role='status'
            >
              <span
                className='schedule-spinner animate-spin motion-reduce:animate-none'
                aria-hidden='true'
              />
              <h2>
                {isRecalculatingPto
                  ? 'Recalculating around the new PTO…'
                  : 'Building your schedule…'}
              </h2>
              <p className='text-sm!'>
                {isRecalculatingPto
                  ? 'Balancing daily counts. This takes a few seconds.'
                  : 'Balancing coverage across six weeks.'}
              </p>
            </div>
          )}

          {view === 'review' && state && (
            <>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div className='flex flex-wrap items-center gap-2'>
                  {selectedWork && !onCallMode && (
                    <span className='text-sm'>
                      Choose an off day in the same week to swap. Esc cancels.
                    </span>
                  )}
                </div>
                <div className='flex flex-wrap gap-2'>
                  {!onCallMode && !ptoMode && (
                    <>
                      <IconButton
                        ariaLabel='Turn on PTO mode'
                        title='Turn on PTO mode'
                        iconImage={palmIcon}
                        variant='outlined'
                        onClick={startPtoMode}
                      />
                      <IconButton
                        ariaLabel='Turn on on-call mode'
                        title='Turn on on-call mode'
                        icon='bi-telephone'
                        variant='outlined'
                        onClick={() => {
                          setOnCallMode(true);
                          setSelectedWork(null);
                        }}
                      />
                      <IconButton
                        ariaLabel='Undo'
                        title='Undo last change'
                        icon='bi-arrow-counterclockwise'
                        variant='outlined'
                        disabled={undoStack.length === 0}
                        onClick={undo}
                      />
                      <IconButton
                        ariaLabel='Redo'
                        title='Redo last undone change'
                        icon='bi-arrow-clockwise'
                        variant='outlined'
                        disabled={redoStack.length === 0}
                        onClick={redo}
                      />
                      {editScheduleId === null && (
                        <IconButton
                          ariaLabel='Regenerate'
                          title='Regenerate schedule'
                          icon='bi-arrow-repeat'
                          variant='outlined'
                          onClick={() => {
                            if (state.hasManualEdits) setShowRegenerate(true);
                            else runGeneration(state);
                          }}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>

              {onCallMode && (
                <section className='oncall-banner' aria-label='On-call mode'>
                  <div className='oncall-banner-title'>
                    <span className='oncall-banner-icon' aria-hidden='true'>
                      <i className='bi bi-telephone' />
                    </span>
                    <strong>On-call mode</strong>
                  </div>
                  <div className='oncall-banner-controls'>
                    <div
                      className='oncall-legend'
                      aria-label='Department legend'
                    >
                      <span>
                        <i className='oncall-legend-dot oncall-proc' />
                        PROC
                      </span>
                      <span>
                        <i className='oncall-legend-dot oncall-pacu' />
                        PACU
                      </span>
                    </div>
                    {state.onCallManuallyEdited && (
                      <button
                        type='button'
                        className='oncall-reset'
                        onClick={autoApplyOnCall}
                      >
                        Reset to auto
                      </button>
                    )}
                    {!state.onCallAutoApplied && (
                      <Button
                        variant='outlined'
                        className='oncall-auto-apply'
                        onClick={autoApplyOnCall}
                      >
                        Auto apply
                      </Button>
                    )}
                    <label className='oncall-mode-control'>
                      <span>On-call mode</span>
                      <button
                        type='button'
                        role='switch'
                        aria-label='Turn off on-call mode'
                        aria-checked={onCallMode}
                        className='oncall-mode-switch'
                        onClick={() => {
                          setOnCallMode(false);
                          setSelectedWork(null);
                          setOnCallPopupKey(null);
                          setWeekendPopupWeek(null);
                        }}
                      >
                        <span />
                      </button>
                    </label>
                  </div>
                </section>
              )}

              {(ptoMode || showPtoRecalculate) && (
                <section className='pto-banner' aria-label='PTO mode'>
                  <div className='pto-banner-title'>
                    <img src={palmTree} alt='' aria-hidden='true' />
                    <strong>PTO mode</strong>
                  </div>
                  <p className='pto-banner-instructions'>
                    Click any day to mark or clear PTO. It replaces working and
                    on-call days. FMLA days are locked.
                  </p>
                  <div className='pto-banner-controls'>
                    <span className='pto-change-count'>
                      {ptoChanges} {ptoChanges === 1 ? 'change' : 'changes'}
                    </span>
                    <label className='oncall-mode-control'>
                      <span>PTO mode</span>
                      <button
                        type='button'
                        role='switch'
                        aria-label='Turn off PTO mode'
                        aria-checked={ptoMode}
                        className='oncall-mode-switch'
                        onClick={requestPtoRecalculation}
                      >
                        <span />
                      </button>
                    </label>
                    <img
                      className='pto-banner-palm-end'
                      src={palmTree}
                      alt=''
                      aria-hidden='true'
                    />
                  </div>
                </section>
              )}

              <div
                className='schedule-grid-scroll review-grid-scroll'
                data-scrolled={reviewGridScrolled}
                onPointerUp={() => setPaintPtoValue(null)}
                onPointerLeave={() => setPaintPtoValue(null)}
                onScroll={(event) =>
                  setReviewGridScrolled(event.currentTarget.scrollLeft > 0)
                }
              >
                <table className='schedule-grid review-grid'>
                  <thead>
                    <tr>
                      <th
                        className='schedule-name-cell'
                        rowSpan={2}
                        scope='col'
                      >
                        Staff
                      </th>
                      {weekGroups(dates, state.startDate).map((group) => (
                        <th
                          key={group.week}
                          colSpan={group.dates.length}
                          scope='colgroup'
                          className='schedule-week-cell'
                        >
                          Week {group.week + 1}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {dates.map((date) => (
                        <th
                          className='schedule-day-cell'
                          id={`day-${date}`}
                          key={date}
                          scope='col'
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
                        <th
                          className={`schedule-name-cell ${person.employment === Emp.PRN ? 'schedule-prn-row' : ''}`}
                          scope='row'
                        >
                          <span className='schedule-staff-label'>
                            {person.firstName} {person.lastName.slice(0, 1)}.
                          </span>
                          {person.role === Role.ChargeNurse && (
                            <span className='schedule-role-label'>CSL</span>
                          )}
                          {person.employment === Emp.PRN && (
                            <span
                              className='schedule-prn-lock'
                              title='PRN'
                              aria-label='PRN'
                            >
                              <i
                                className='bi bi-lock-fill'
                                aria-hidden='true'
                              />
                            </span>
                          )}
                        </th>
                        {dates.map((date, columnIndex) => {
                          const key = cellKey(person.id, date);
                          const isFmla = fmlaSet.has(key);
                          const isPto = !isFmla && ptoSet.has(key);
                          const isLeave = isFmla || isPto;
                          const shift = state.shifts.find(
                            (item) =>
                              item.staffId === person.id &&
                              item.date === date &&
                              item.kind === 'work',
                          );
                          const isOnCall = state.onCall.includes(key);
                          const showOnCall = isOnCall && !ptoMode;
                          const showWork =
                            shift !== undefined || (ptoMode && isOnCall);
                          const departmentChoices = [
                            Dept.PROC,
                            Dept.PACU,
                          ].filter((department) =>
                            person.departments.includes(department),
                          );
                          const canChooseEitherDepartment =
                            departmentChoices.length === 0;
                          const shouldShowDepartmentPopup =
                            person.role === Role.ChargeNurse ||
                            departmentChoices.length !== 1;
                          const callDepartment =
                            state.onCallDepartments?.[key] ??
                            (person.departments.includes(Dept.PACU)
                              ? Dept.PACU
                              : Dept.PROC);
                          const showPto = isPto && !onCallMode;
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
                            !isLeave &&
                            !shift &&
                            !isOnCall &&
                            !onCallMode;
                          const canSelect =
                            shift !== undefined && !isOnCall && !onCallMode;
                          const isPrn = person.employment === Emp.PRN;
                          const countsTowardTargets =
                            shift?.countsTowardTargets ?? true;
                          const enabled = ptoMode
                            ? !isFmla
                            : onCallMode
                              ? !isLeave && shift !== undefined
                              : isPrn
                                ? false
                                : selectedWork
                                  ? isSwapTarget || canSelect
                                  : canSelect;
                          const label = isFmla
                            ? 'FMLA'
                            : isPto
                              ? 'PTO'
                              : showOnCall
                                ? `On-call ${callDepartment === Dept.PACU ? 'PACU' : 'PROC'}`
                                : showWork
                                  ? countsTowardTargets
                                    ? 'Working'
                                    : 'Working, does not count toward target'
                                  : 'Off';
                          return (
                            <td key={date}>
                              <button
                                type='button'
                                aria-label={`${person.firstName} ${person.lastName}, ${formatDate(date)}: ${label}`}
                                aria-pressed={
                                  ptoMode ? isPto : isSelected || isOnCall
                                }
                                aria-haspopup={
                                  shouldShowDepartmentPopup
                                    ? 'dialog'
                                    : undefined
                                }
                                aria-expanded={
                                  shouldShowDepartmentPopup &&
                                  onCallPopupKey === key
                                }
                                disabled={!enabled}
                                data-grid-row={rowIndex}
                                data-grid-column={columnIndex}
                                className={`schedule-cell ${showPto ? 'schedule-cell-pto' : ''} ${isFmla ? 'schedule-cell-fmla' : ''} ${showWork && !isPto ? 'schedule-cell-work' : ''} ${showOnCall ? `schedule-cell-oncall ${callDepartment === Dept.PACU ? 'schedule-cell-oncall-pacu' : 'schedule-cell-oncall-proc'}` : ''} ${isSelected ? 'schedule-cell-selected' : ''} ${isSwapTarget ? 'schedule-cell-target' : ''} ${!onCallMode && isPrn && !ptoMode ? 'schedule-cell-disabled' : ''}`}
                                onPointerDown={(event) => {
                                  if (!ptoMode || event.button !== 0 || isFmla) {
                                    return;
                                  }
                                  event.preventDefault();
                                  const nextValue = !isPto;
                                  setPaintPtoValue(nextValue);
                                  setReviewPto(key, nextValue);
                                }}
                                onPointerEnter={() => {
                                  if (ptoMode && !isFmla && paintPtoValue !== null) {
                                    setReviewPto(key, paintPtoValue);
                                  }
                                }}
                                onClick={(event) => {
                                  if (ptoMode && !isFmla) {
                                    if (event.detail === 0) {
                                      setReviewPto(key, !isPto);
                                    }
                                  } else if (onCallMode && !isLeave && shift) {
                                    beginOnCallAssignment(person, date);
                                  } else if (isSwapTarget && selectedWork) {
                                    makeSwap(
                                      selectedWork.staffId,
                                      selectedWork.date,
                                      date,
                                    );
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
                                {isFmla
                                  ? 'F'
                                  : showPto
                                    ? 'P'
                                    : showOnCall
                                      ? 'OC'
                                      : showWork
                                        ? 'W'
                                        : '–'}
                              </button>
                              {onCallMode &&
                                shouldShowDepartmentPopup &&
                                onCallPopupKey === key && (
                                  <div
                                    className='oncall-department-popup'
                                    role='dialog'
                                    aria-label={`On-call department for ${person.firstName} ${person.lastName} on ${formatDate(date)}`}
                                  >
                                    <div className='oncall-department-heading'>
                                      <strong>
                                        {person.firstName} {person.lastName}
                                      </strong>
                                      <span>{formatDate(date)}</span>
                                    </div>
                                    <div className='oncall-department-options'>
                                      {(canChooseEitherDepartment
                                        ? [Dept.PROC, Dept.PACU]
                                        : departmentChoices
                                      ).map((department) => (
                                        <button
                                          type='button'
                                          key={department}
                                          aria-pressed={
                                            isOnCall &&
                                            callDepartment === department
                                          }
                                          className={`oncall-department-option ${department === Dept.PROC ? 'oncall-proc-option' : 'oncall-pacu-option'}`}
                                          onClick={() =>
                                            setOnCallAssignment(
                                              person.id,
                                              date,
                                              department,
                                            )
                                          }
                                        >
                                          <i
                                            className={`oncall-legend-dot ${department === Dept.PROC ? 'oncall-proc' : 'oncall-pacu'}`}
                                            aria-hidden='true'
                                          />
                                          {department === Dept.PACU
                                            ? 'PACU'
                                            : 'PROC'}
                                        </button>
                                      ))}
                                    </div>
                                    <p>
                                      On-call days{' '}
                                      {state.onCall.filter((callKey) =>
                                        callKey.startsWith(`${person.id}:`),
                                      ).length +
                                        (state.weekendOnCall ?? []).filter(
                                          (assignment) =>
                                            assignment.staffId === person.id,
                                        ).length *
                                          2}{' '}
                                      of {onCallTarget(person.employment)}
                                    </p>
                                    <div className='oncall-popup-actions'>
                                      {isOnCall && (
                                        <button
                                          type='button'
                                          className='oncall-remove'
                                          onClick={() =>
                                            setOnCallAssignment(
                                              person.id,
                                              date,
                                              null,
                                            )
                                          }
                                        >
                                          Remove OC
                                        </button>
                                      )}
                                      <button
                                        type='button'
                                        className='oncall-done'
                                        onClick={() => setOnCallPopupKey(null)}
                                      >
                                        Done
                                      </button>
                                    </div>
                                  </div>
                                )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {[
                      [
                        'Nurses',
                        Role.Nurse,
                        state.settingsSnapshot.targetNurses,
                      ],
                      ['Techs', Role.Tech, state.settingsSnapshot.targetTechs],
                    ].map(([label, role, target]) => (
                      <tr key={label}>
                        <th className='schedule-name-cell' scope='row'>
                          {label} / {target}
                        </th>
                        {dates.map((date) => {
                          const counts = dailyCounts(
                            date,
                            state.staffSnapshot,
                            state.shifts,
                          );
                          const count =
                            role === Role.Nurse ? counts.nurses : counts.techs;
                          const isLow = count < Number(target);
                          return (
                            <td key={date}>
                              <span
                                className={`schedule-total ${isLow ? 'schedule-total-low' : ''}`}
                                aria-label={`${count} of ${target}`}
                              >
                                {count}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {onCallMode && (
                      <tr className='schedule-weekend-row'>
                        <th className='schedule-name-cell' scope='row'>
                          Weekend OC
                        </th>
                        {weekGroups(dates, state.startDate).map((group) => {
                          const eligibleWeekendStaff =
                            getWeekendOnCallEligibleStaff(
                              weekendOnCallStaff,
                              group.dates[0],
                              state.shifts,
                              state.ptoDates,
                              state.fmlaEntries,
                            );
                          const assignment = (state.weekendOnCall ?? []).find(
                            (entry) => entry.weekStart === group.dates[0],
                          );
                          const assignedStaff = eligibleWeekendStaff.find(
                            (person) => person.id === assignment?.staffId,
                          );
                          return (
                            <td key={group.week} colSpan={group.dates.length}>
                              <div className='schedule-weekend-picker'>
                                <button
                                  type='button'
                                  aria-label={`Weekend OC Week ${group.week + 1}`}
                                  aria-expanded={
                                    weekendPopupWeek === group.dates[0]
                                  }
                                  aria-haspopup='listbox'
                                  className='schedule-weekend-select'
                                  disabled={
                                    !onCallMode ||
                                    eligibleWeekendStaff.length === 0
                                  }
                                  onClick={() =>
                                    setWeekendPopupWeek((current) =>
                                      current === group.dates[0]
                                        ? null
                                        : group.dates[0],
                                    )
                                  }
                                >
                                  {assignedStaff
                                    ? `${assignedStaff.firstName} ${assignedStaff.lastName.slice(0, 1)}.`
                                    : 'Assign nurse'}
                                  <i
                                    className='bi bi-chevron-down'
                                    aria-hidden='true'
                                  />
                                </button>
                                {weekendPopupWeek === group.dates[0] && (
                                  <div
                                    className='schedule-weekend-options'
                                    role='listbox'
                                    aria-label={`Eligible staff for Weekend OC Week ${group.week + 1}`}
                                  >
                                    <button
                                      type='button'
                                      role='option'
                                      aria-selected={
                                        assignment?.staffId === null
                                      }
                                      onClick={() => {
                                        updateWeekendOnCall(group.dates[0], '');
                                        setWeekendPopupWeek(null);
                                      }}
                                    >
                                      Assign nurse
                                    </button>
                                    {eligibleWeekendStaff.map((person) => (
                                      <button
                                        type='button'
                                        role='option'
                                        aria-selected={
                                          assignment?.staffId === person.id
                                        }
                                        key={person.id}
                                        onClick={() => {
                                          updateWeekendOnCall(
                                            group.dates[0],
                                            String(person.id),
                                          );
                                          setWeekendPopupWeek(null);
                                        }}
                                      >
                                        {person.firstName}{' '}
                                        {person.lastName.slice(0, 1)}.
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>

              <div className='flex flex-col gap-2'>
                <p className='text-sm!'>
                  W work · – off · P PTO · F FMLA · OC on-call. Counts exclude
                  orientation staff.{' '}
                  {ptoMode
                    ? 'Click any non-FMLA day to add or clear PTO.'
                    : 'Select a workday, then a highlighted off day to swap.'}
                </p>
              </div>

              {savingError && (
                <p role='alert' className='text-sm! text-cherry-600'>
                  {savingError}
                </p>
              )}
              <div className='flex flex-wrap justify-between gap-2'>
                <IconButton
                  ariaLabel='Back'
                  icon='bi-chevron-left'
                  variant='outlined'
                  onClick={() => {
                    if (editScheduleId !== null) {
                      navigate(`/schedules/${editScheduleId}`);
                    } else if (state.hasManualEdits) setShowBackReview(true);
                    else returnToInputs();
                  }}
                />
                <IconButton
                  ariaLabel='Confirm'
                  title={ptoMode ? 'Confirm PTO changes' : 'Confirm schedule'}
                  icon='bi-check-lg'
                  variant='filled'
                  onClick={() => {
                    if (ptoMode) {
                      requestPtoRecalculation();
                    } else {
                      setShowConfirm(true);
                    }
                  }}
                />
              </div>
            </>
          )}
        </div>
      </PageContent>

      <Dialog
        open={pendingOnCallWarning !== null}
        title='Confirm on-call assignment'
        onCancel={() => setPendingOnCallWarning(null)}
        onConfirm={confirmUnconventionalOnCall}
        cancelLabel='Cancel'
        confirmLabel='Confirm'
      >
        {pendingOnCallWarning &&
          (state?.staffSnapshot.find(
            (person) => person.id === pendingOnCallWarning.staffId,
          )?.inOrientation ? (
            <p>
              This user is in oritentation. Are you sure you want to put them on
              call?
            </p>
          ) : (
            <p>
              This user is not trained in PACU or PROC. Are you sure you want to
              put them on call?
            </p>
          ))}
      </Dialog>

      <Dialog
        open={showPtoRecalculate}
        title='Recalculate the schedule?'
        onCancel={keepEditingPto}
        onSecondary={discardPtoChanges}
        onConfirm={recalculateAroundPto}
        cancelLabel='Keep editing'
        secondaryLabel='Discard changes'
        confirmLabel='Recalculate'
        confirmDisabled={isWorking}
        secondaryDisabled={isWorking}
      >
        <p>
          Colonder will rebalance daily counts around PTO changes. Working and
          on-call days you set by hand may be lost.
        </p>
      </Dialog>

      <Dialog
        open={showConfirm}
        title={
          editScheduleId !== null ? 'Save schedule changes' : 'Confirm schedule'
        }
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => void confirmSchedule()}
        confirmLabel={
          isWorking
            ? 'Saving…'
            : editScheduleId !== null
              ? 'Save changes'
              : 'Confirm schedule'
        }
        confirmDisabled={isWorking}
      >
        {state && (
          <div className='flex flex-col gap-4'>
            <p>
              {editScheduleId !== null ? 'Save changes to' : 'Confirm'}{' '}
              {formatDateRange(state.startDate, state.endDate)} for{' '}
              {state.staffSnapshot.length} staff members.
            </p>
            <p>
              Nurses {countRange('nurses', 'min')}–{countRange('nurses', 'max')}{' '}
              / {state.settingsSnapshot.targetNurses} per day · Techs{' '}
              {countRange('techs', 'min')}–{countRange('techs', 'max')} /{' '}
              {state.settingsSnapshot.targetTechs} per day
            </p>
            {savingError && (
              <p role='alert' className='text-cherry-600'>
                {savingError}
              </p>
            )}
          </div>
        )}
      </Dialog>

      <Dialog
        open={showRegenerate}
        title='Discard manual edits?'
        onCancel={() => setShowRegenerate(false)}
        onConfirm={() => {
          setShowRegenerate(false);
          if (state) runGeneration(state);
        }}
        confirmLabel='Regenerate'
      >
        Regenerating will discard all manual swaps and on-call assignments.
      </Dialog>

      <Dialog
        open={
          editScheduleId === null &&
          (showDiscard || blocker.state === 'blocked')
        }
        title='Leave this schedule?'
        onCancel={() => {
          setShowDiscard(false);
          setError(null);
          if (blocker.state === 'blocked') blocker.reset();
        }}
        onSecondary={() => void saveDraftAndLeave()}
        onConfirm={() => void discardDraft()}
        cancelLabel='Cancel'
        secondaryLabel='Save draft'
        confirmLabel='Discard draft'
        confirmDisabled={isWorking}
        secondaryDisabled={isWorking}
        confirmVariant='danger'
      >
        <div className='flex flex-col gap-3'>
          <p>
            Save this draft to continue it later, or discard it to remove it
            permanently. Cancel to stay here and keep editing.
          </p>
          {error && (
            <p role='alert' className='text-cherry-600'>
              {error}
            </p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={showBackReview}
        title='Discard review edits?'
        onCancel={() => setShowBackReview(false)}
        onConfirm={returnToInputs}
        confirmLabel='Back to inputs'
      >
        Returning to the input step will discard swaps and on-call assignments.
      </Dialog>
    </>
  );
};

export default GeneratorPage;
