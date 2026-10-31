import { Field } from 'formik';

type TextFieldProps = {
  name: string;
  label: string;
  type?: string;
};

export const TextField = ({ name, label, type = 'text' }: TextFieldProps) => (
  <div className="flex flex-1 flex-col gap-1">
    <label htmlFor={name}>{label}</label>
    <Field id={name} aria-label={label} type={type} name={name} />
  </div>
);
