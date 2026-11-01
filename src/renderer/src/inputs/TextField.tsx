import { useField } from 'formik';
import { TimePicker } from './TimePicker';

type TextFieldProps = {
  name: string;
  label: string;
  reserveErrorSpace?: boolean;
  type?: string;
};

export const TextField = ({
  name,
  label,
  reserveErrorSpace = false,
  type = 'text',
}: TextFieldProps) => {
  const [field, meta, helpers] = useField(name);
  const error = meta.touched ? meta.error : undefined;

  if (type === 'time') {
    return (
      <TimePicker
        name={name}
        label={label}
        value={String(field.value ?? '')}
        error={error}
        reserveErrorSpace={reserveErrorSpace}
        onChange={(value) => void helpers.setValue(value)}
        onBlur={() => void helpers.setTouched(true)}
        onValidationError={(validationError) =>
          helpers.setError(validationError ?? undefined)
        }
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-1">
      <label htmlFor={name}>{label}</label>
      <input
        {...field}
        id={name}
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className={error ? 'border-2 border-cherry-600' : ''}
        type={type}
        onChange={
          type === 'number'
            ? (event) => {
                const value = event.currentTarget.value;
                void helpers.setValue(value === '' ? '' : Number(value));
              }
            : field.onChange
        }
      />
      {reserveErrorSpace && (
        <p
          id={`${name}-error`}
          className="min-h-4 text-xs text-cherry-600"
          role={error ? 'alert' : undefined}
          aria-live="polite"
        >
          {error ?? ' '}
        </p>
      )}
    </div>
  );
};
