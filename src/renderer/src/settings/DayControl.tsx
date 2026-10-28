import { useField } from 'formik';

type DayControlProps = {
  index: number;
  name: string;
  value: boolean;
};

export const DayControl = ({ index, name, value }: DayControlProps) => {
  const [, , { setValue }] = useField(`workingDays[${index}]`);

  return (
    <button
      type="button"
      aria-pressed={value}
      aria-label={name}
      className={`flex flex-col justify-center w-15 h-15 sm:w-20 sm:h-20 gap-1 cursor-pointer font-sans font-semibold border border-grey-200 rounded-2xl hover:border-mint-600 hover:bg-mint-50 ${value ? 'text-mint-600 border-mint-600 bg-mint-100 border-2' : ''}`}
      onClick={() => setValue(!value)}
    >
      {name}
    </button>
  );
};
