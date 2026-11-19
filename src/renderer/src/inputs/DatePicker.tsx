import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';

type DatePickerProps = {
  label: string;
  value: string | null;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  scheduleStart: string;
  scheduleEnd: string;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string | null) => void;
};

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));

const monthStart = (value: string): Date => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

const addMonths = (value: Date, amount: number): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + amount, 1));

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

const formatMonth = (value: Date): string =>
  new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value);

const formatPeriodDate = (value: string): string =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));

const getCalendarDays = (month: Date): Date[] => {
  const firstDay = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1),
  );
  const count = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const offset = firstDay.getUTCDay();
  const cells = Math.ceil((offset + count) / 7) * 7;
  return Array.from({ length: cells }, (_, index) =>
    new Date(
      Date.UTC(
        month.getUTCFullYear(),
        month.getUTCMonth(),
        index - offset + 1,
      ),
    ),
  );
};

export const isDateWithinPickerRange = (
  date: string,
  minDate?: string,
  maxDate?: string,
): boolean =>
  (minDate === undefined || date >= minDate) &&
  (maxDate === undefined || date <= maxDate);

export const DatePicker = ({
  label,
  value,
  placeholder = 'Optional',
  minDate,
  maxDate,
  rangeStart = null,
  rangeEnd = null,
  scheduleStart,
  scheduleEnd,
  invalid = false,
  describedBy,
  onChange,
}: DatePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draftDate, setDraftDate] = useState<string | null>(value);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    monthStart(value ?? scheduleStart),
  );
  const [position, setPosition] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popupId = `date-picker-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = 224;
      const height = 300;
      const margin = 12;
      const left = Math.max(
        margin,
        Math.min(bounds.left, window.innerWidth - width - margin),
      );
      const top =
        window.innerHeight - bounds.bottom < height
          ? Math.max(margin, bounds.top - height - 6)
          : bounds.bottom + 6;
      setPosition({ left, top });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissEscape);
    };
  }, [isOpen]);

  const open = () => {
    setDraftDate(value);
    setVisibleMonth(monthStart(value ?? scheduleStart));
    setIsOpen(true);
  };
  const finish = () => {
    onChange(draftDate);
    setIsOpen(false);
    triggerRef.current?.focus();
  };
  const effectiveRangeEnd = label.startsWith('End') ? draftDate : rangeEnd;
  const isInRange = (date: string) =>
    rangeStart !== null &&
    effectiveRangeEnd !== null &&
    date >= rangeStart &&
    date <= effectiveRangeEnd;
  const days = getCalendarDays(visibleMonth);

  return (
    <>
      <button
        ref={triggerRef}
        type='button'
        className={`fmla-date-trigger ${value ? '' : 'is-empty'}`}
        aria-label={label}
        aria-haspopup='dialog'
        aria-expanded={isOpen}
        aria-controls={popupId}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onClick={() => (isOpen ? setIsOpen(false) : open())}
      >
        <span>{value ? formatDate(value) : placeholder}</span>
        <i className='bi bi-calendar3' aria-hidden='true' />
      </button>
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            id={popupId}
            role='dialog'
            aria-label={`${label} calendar`}
            className='fmla-date-popover'
            style={position}
          >
            <header className='fmla-date-popover-header'>
              <span>{label.startsWith('End') ? 'End date' : 'Start date'}</span>
              <span>{draftDate ? formatDate(draftDate) : 'Optional'}</span>
            </header>
            <div className='fmla-calendar-navigation'>
              <button
                type='button'
                aria-label='Previous month'
                onClick={() => setVisibleMonth((month) => addMonths(month, -1))}
              >
                <i className='bi bi-chevron-left' aria-hidden='true' />
              </button>
              <strong>{formatMonth(visibleMonth)}</strong>
              <button
                type='button'
                aria-label='Next month'
                onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
              >
                <i className='bi bi-chevron-right' aria-hidden='true' />
              </button>
            </div>
            <div className='fmla-calendar-grid' role='grid'>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                <span
                  key={`${day}-${index}`}
                  className='fmla-calendar-weekday'
                  role='columnheader'
                >
                  {day}
                </span>
              ))}
              {days.map((date) => {
                const iso = isoDate(date);
                const isCurrentMonth =
                  date.getUTCMonth() === visibleMonth.getUTCMonth();
                const disabled = !isDateWithinPickerRange(
                  iso,
                  minDate,
                  maxDate,
                );
                return (
                  <button
                    key={iso}
                    type='button'
                    role='gridcell'
                    aria-label={formatDate(iso)}
                    aria-selected={draftDate === iso}
                    disabled={disabled}
                    className={[
                      'fmla-calendar-day',
                      isCurrentMonth ? '' : 'outside-month',
                      isInRange(iso) ? 'in-fmla-range' : '',
                      draftDate === iso ? 'selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setDraftDate(iso)}
                  >
                    {date.getUTCDate()}
                  </button>
                );
              })}
            </div>
            <p className='fmla-calendar-period'>
              Schedule period: {formatPeriodDate(scheduleStart)} – {formatPeriodDate(scheduleEnd)}
            </p>
            <footer className='fmla-calendar-actions'>
              <button
                type='button'
                className='fmla-calendar-clear'
                onClick={() => setDraftDate(null)}
              >
                Clear
              </button>
              <button
                type='button'
                className='fmla-calendar-done'
                onClick={finish}
              >
                Done
              </button>
            </footer>
          </div>,
          document.body,
        )}
    </>
  );
};

export const getDatePickerCalendarDays = getCalendarDays;
