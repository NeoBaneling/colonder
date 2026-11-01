import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { IconButton } from './IconButton';
import { addTimeMinutes, formatTime, parseTime } from './time';

type TimePickerProps = {
  className?: string;
  disabled?: boolean;
  error?: string;
  inline?: boolean;
  label: string;
  name: string;
  onBlur?: () => void;
  onCancel?: () => void;
  onChange: (value: string) => void;
  onValidationError?: (error: string | null) => void;
  openOnMount?: boolean;
  popoverAnchorLeft?: number;
  reserveErrorSpace?: boolean;
  style?: CSSProperties;
  value: string;
};

const hours = Array.from({ length: 12 }, (_, index) => index + 1);
const minutes = [0, 15, 30, 45];

export const TimePicker = ({
  className = '',
  disabled = false,
  error,
  inline = false,
  label,
  name,
  onBlur,
  onCancel,
  onChange,
  onValidationError,
  openOnMount = false,
  popoverAnchorLeft,
  reserveErrorSpace = false,
  style,
  value,
}: TimePickerProps) => {
  const [isOpen, setIsOpen] = useState(openOnMount);
  const [draftTime, setDraftTime] = useState(value);
  const [draftText, setDraftText] = useState(formatTime(value));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [placement, setPlacement] = useState<'above' | 'below'>('below');
  const [popoverPosition, setPopoverPosition] = useState<CSSProperties>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const selectedHourRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setDraftTime(value);
      setDraftText(formatTime(value));
    }
  }, [isOpen, value]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    const pickerHeight = 300;
    const updatePosition = () => {
      const inputBounds = inputRef.current?.getBoundingClientRect();
      if (!inputBounds) return;

      const opensAbove =
        window.innerHeight - inputBounds.bottom < pickerHeight;
      setPlacement(opensAbove ? 'above' : 'below');
      if (inline) {
        const popoverWidth = 240;
        const margin = 12;
        setPopoverPosition({
          top: opensAbove
            ? Math.max(margin, inputBounds.top - pickerHeight - 6)
            : inputBounds.bottom + 6,
          left: Math.max(
            margin,
            Math.min(
              popoverAnchorLeft ?? inputBounds.left,
              window.innerWidth - popoverWidth - margin,
            ),
          ),
        });
      }
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const hourList = hourListRef.current;
    const selectedHour = selectedHourRef.current;
    if (hourList && selectedHour) {
      hourList.scrollTop =
        selectedHour.offsetTop -
        (hourList.clientHeight - selectedHour.clientHeight) / 2;
    }
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [inline, isOpen, popoverAnchorLeft]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setDraftTime(value);
        setDraftText(formatTime(value));
        setValidationError(null);
        onValidationError?.(null);
        setIsOpen(false);
        onCancel?.();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, onValidationError, value]);

  const setDraftValue = (time: string) => {
    setDraftTime(time);
    setDraftText(formatTime(time));
    setValidationError(null);
    onValidationError?.(null);
  };

  const parseDraft = () => {
    const parsed = parseTime(draftText);
    if (parsed.value === null) {
      setValidationError(parsed.error);
      onValidationError?.(parsed.error);
      return null;
    }
    setDraftValue(parsed.value);
    return parsed.value;
  };

  const finish = () => {
    const time = parseDraft();
    if (time === null) return false;
    onChange(time);
    setIsOpen(false);
    onBlur?.();
    return true;
  };

  const cancel = () => {
    setDraftTime(value);
    setDraftText(formatTime(value));
    setValidationError(null);
    onValidationError?.(null);
    setIsOpen(false);
    onCancel?.();
    onCancel?.();
  };

  const open = () => {
    if (disabled) return;
    setDraftTime(value);
    setDraftText(formatTime(value));
    setValidationError(null);
    onValidationError?.(null);
    setIsOpen(true);
  };

  const currentTime = parseTime(draftText).value ?? draftTime;
  const [hoursText, minutesText] = currentTime.split(':');
  const currentHours = Number(hoursText);
  const currentMinutes = Number(minutesText);
  const currentPeriod = currentHours >= 12 ? 'PM' : 'AM';
  const currentHour = currentHours % 12 || 12;
  const currentError = validationError ?? error;

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) open();
      setDraftValue(addTimeMinutes(currentTime, event.key === 'ArrowUp' ? 15 : -15));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (isOpen) finish();
      else open();
    }
  };

  const handleRootBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    if (!finish()) onBlur?.();
  };

  const chooseHour = (hour: number) => {
    const selectedHours =
      hour % 12 + (currentPeriod === 'PM' ? 12 : 0);
    setDraftValue(
      `${String(selectedHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`,
    );
  };

  const chooseMinute = (minute: number) => {
    setDraftValue(
      `${String(currentHours).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    );
  };

  return (
    <div
      className={`time-picker ${className}`.trim()}
      style={style}
      onBlurCapture={handleRootBlur}
    >
      <label
        htmlFor={name}
        className={inline ? 'time-picker-visually-hidden' : undefined}
      >
        {label}
      </label>
      <div className="time-picker-field">
        <input
          ref={inputRef}
          id={name}
          name={name}
          type="text"
          inputMode="text"
          autoComplete="off"
          aria-label={label}
          aria-invalid={Boolean(currentError)}
          aria-describedby={currentError ? `${name}-error` : undefined}
          value={draftText}
          disabled={disabled}
          className={currentError ? 'time-picker-input time-picker-input-error' : 'time-picker-input'}
          onChange={(event) => {
            setDraftText(event.currentTarget.value);
            const parsed = parseTime(event.currentTarget.value);
            if (parsed.value !== null) {
              setDraftTime(parsed.value);
              setValidationError(null);
              onValidationError?.(null);
            }
          }}
          onClick={() => {
            if (!isOpen) open();
          }}
          onKeyDown={handleInputKeyDown}
        />
        <button
          type="button"
          className="time-picker-clock"
          aria-label="Open time picker"
          aria-expanded={isOpen}
          disabled={disabled}
          onClick={() => (isOpen ? cancel() : open())}
        >
          <i className="bi bi-clock" aria-hidden="true" />
        </button>
      </div>

      {currentError && (
        <p
          id={`${name}-error`}
          className="time-picker-error"
          role="alert"
          aria-live="polite"
        >
          <i className="bi bi-exclamation-circle" aria-hidden="true" />
          {currentError}
        </p>
      )}
      {reserveErrorSpace && !inline && !currentError && (
        <p id={`${name}-error`} className="time-picker-error" aria-live="polite">
          {' '}
        </p>
      )}

      {isOpen && (
        <div
          className="time-picker-popover"
          role="dialog"
          aria-label={`${label} time picker`}
          data-placement={placement}
          style={inline ? popoverPosition : undefined}
        >
          <div className="time-picker-columns">
            <div className="time-picker-column">
              <span className="time-picker-column-label">Hour</span>
              <div className="time-picker-options" ref={hourListRef}>
                {hours.map((hour) => {
                  const selected = currentHour === hour;
                  return (
                    <button
                      key={hour}
                      ref={selected ? selectedHourRef : null}
                      type="button"
                      className={
                        selected
                          ? 'time-picker-option time-picker-option-selected'
                          : 'time-picker-option'
                      }
                      aria-pressed={selected}
                      onClick={() => chooseHour(hour)}
                    >
                      {hour}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="time-picker-column">
              <span className="time-picker-column-label">Minute</span>
              <div className="time-picker-options">
                {minutes.map((minute) => {
                  const selected = currentMinutes === minute;
                  return (
                    <button
                      key={minute}
                      type="button"
                      className={
                        selected
                          ? 'time-picker-option time-picker-option-selected'
                          : 'time-picker-option'
                      }
                      aria-pressed={selected}
                      onClick={() => chooseMinute(minute)}
                    >
                      {String(minute).padStart(2, '0')}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="time-picker-column">
              <span className="time-picker-column-label">AM / PM</span>
              <div className="time-picker-options">
                {(['AM', 'PM'] as const).map((period) => {
                  const selected = currentPeriod === period;
                  return (
                    <button
                      key={period}
                      type="button"
                      className={
                        selected
                          ? 'time-picker-option time-picker-option-selected'
                          : 'time-picker-option'
                      }
                      aria-pressed={selected}
                      onClick={() => {
                        const selectedHours =
                          currentHours % 12 + (period === 'PM' ? 12 : 0);
                        setDraftValue(
                          `${String(selectedHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`,
                        );
                      }}
                    >
                      {period}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="time-picker-actions">
            <IconButton
              ariaLabel="Cancel time selection"
              title="Cancel"
              icon="bi-x-lg"
              variant="outlined"
              className="time-picker-action-button w-9 h-9"
              onClick={cancel}
            />
            <IconButton
              ariaLabel="Confirm time selection"
              title="Done"
              icon="bi-check-lg"
              variant="filled"
              className="time-picker-action-button w-9 h-9"
              onClick={finish}
            />
          </div>
        </div>
      )}
    </div>
  );
};
