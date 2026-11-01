import { useField } from 'formik';
import type { ChangeEventHandler } from 'react';

type ToggleProps = {
  disabled?: boolean;
  label?: string;
  name: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  validateOnChange?: boolean;
};

export const Toggle = ({
  disabled,
  label,
  name,
  onChange,
  validateOnChange = false,
}: ToggleProps) => {
  const [field, , helpers] = useField<boolean>(name);

  return (
    <label className="toggle">
      <input
        aria-label={label ?? name}
        checked={Boolean(field.value)}
        disabled={disabled}
        name={name}
        role="switch"
        type="checkbox"
        onBlur={field.onBlur}
        onChange={(event) => {
          onChange?.(event);
          void helpers.setValue(event.currentTarget.checked, validateOnChange);
          if (validateOnChange) void helpers.setTouched(true, false);
        }}
      />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  );
};
