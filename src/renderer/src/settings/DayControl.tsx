import { useField, useFormikContext } from 'formik';

type DayControlProps = {
  index: number;
  name: string;
  value: boolean;
  fieldName?: string;
  validateOnChange?: boolean;
};

export const DayControl = ({
  index,
  name,
  value,
  fieldName = 'workingDays',
  validateOnChange = false,
}: DayControlProps) => {
  const [, , { setValue }] = useField(`${fieldName}[${index}]`);
  const { setFieldTouched } = useFormikContext<object>();

  return (
    <button
      type="button"
      aria-pressed={value}
      aria-label={name}
      className={`flex flex-col justify-center w-15 h-15 sm:w-20 sm:h-20 gap-1 cursor-pointer font-sans font-semibold border border-grey-200 rounded-2xl hover:border-mint-600 hover:bg-mint-50 ${value ? 'text-mint-600 border-mint-600 bg-mint-100 border-2' : ''}`}
      onClick={() => setValue(!value, validateOnChange)}
      onBlur={() => {
        void setFieldTouched(fieldName, true);
      }}
    >
      {name}
    </button>
  );
};
