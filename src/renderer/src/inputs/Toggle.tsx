import { Field } from 'formik';
import type { ChangeEventHandler } from 'react';

type ToggleProps = {
  disabled?: boolean;
  label?: string;
  name: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
};

export const Toggle = ({ disabled, label, name, onChange }: ToggleProps) => (
  <label className="toggle">
    <Field
      aria-label={label ?? name}
      disabled={disabled}
      name={name}
      role="switch"
      type="checkbox"
    />
    <span className="toggle-track" aria-hidden="true" />
  </label>
);
